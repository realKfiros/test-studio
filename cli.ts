#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { configNames, loadProject } from "./config.ts";
import { startServer } from "./server.ts";

const help = `Test Studio — a local test explorer and runner

Usage:
  test-studio [project-path] [--port 4310] [--config path]
  test-studio init [project-path]

Options:
  --port <number>    Override the configured port (0 chooses a free port)
  --config <path>    Config file, relative to the project root
  -h, --help        Show help
  -v, --version     Show version

Defaults to the current directory. Built-in adapters: Bun and Maestro.
Custom adapters are loaded from your Test Studio config.
`;
async function init(rootInput: string) {
	const root = await realpath(rootInput);
	if (!(await stat(root)).isDirectory()) throw new Error("Project path must be a directory.");
	const existing: string[] = [];
	for (const name of configNames) {
		try {
			await stat(join(root, name));
			existing.push(name);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	const files: Record<string, string> = {
		".teststudioignore":
			"# Additional paths to exclude from test discovery.\n# Gitignore syntax: directories, globs, and !exceptions.\n# fixtures/generated/\n",
	};
	if (existing.length) console.log(`Keeping existing config: ${existing.join(", ")}`);
	else
		files["test-studio.config.json"] =
			JSON.stringify({ adapters: ["bun", "maestro"], exclude: [] }, null, "\t") + "\n";
	for (const [name, source] of Object.entries(files)) {
		try {
			await writeFile(join(root, name), source, { flag: "wx" });
			console.log(`Created ${name}`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			console.log(`Keeping existing ${name}`);
		}
	}
}
async function main() {
	const { values, positionals } = parseArgs({
		options: {
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
			port: { type: "string" },
			config: { type: "string" },
		},
		allowPositionals: true,
		strict: true,
	});
	if (values.help) {
		console.log(help);
		return;
	}
	if (values.version) {
		const manifest = JSON.parse(
			await readFile(
				new URL(
					import.meta.url.endsWith(".ts") ? "./package.json" : "../package.json",
					import.meta.url,
				),
				"utf8",
			),
		);
		console.log(manifest.version);
		return;
	}
	const initializing = positionals[0] === "init";
	const paths = initializing ? positionals.slice(1) : positionals;
	if (paths.length > 1) throw new Error("Provide only one project path.");
	const root = resolve(paths[0] ?? process.cwd());
	if (initializing) {
		if (values.config !== undefined || values.port !== undefined)
			throw new Error("init accepts only a project path.");
		await init(root);
		return;
	}
	if (values.config !== undefined && !values.config.trim())
		throw new Error("--config requires a path.");
	let port: number | undefined;
	if (values.port !== undefined) {
		if (!/^\d+$/.test(values.port) || Number(values.port) > 65535)
			throw new Error("Port must be an integer between 0 and 65535.");
		port = Number(values.port);
	}
	const project = await loadProject(root, values.config);
	const app = await startServer(root, port, project);
	console.log(
		`\n  Test Studio → http://127.0.0.1:${app.server.port}\n  Watching ${project.root}\n  Adapters: ${project.adapters.map((adapter) => adapter.label).join(", ") || "none"}\n  Press Ctrl+C to stop.\n`,
	);
	let stopping = false;
	for (const signal of ["SIGINT", "SIGTERM"] as const)
		process.on(signal, () => {
			if (stopping) return;
			stopping = true;
			app.stop();
			setTimeout(() => process.exit(0), 1700);
		});
}
main().catch((error) => {
	console.error(`Test Studio: ${error.message}`);
	process.exitCode = 1;
});

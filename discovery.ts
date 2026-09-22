import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import ignore from "ignore";
import { executablePath } from "./adapters.ts";
import { loadProject, isRecord, type Project } from "./config.ts";
import { discoverScript, testPath } from "./detectors.ts";
import type { Manifest, DiscoveredFile } from "./adapter.ts";
import type { Catalog, TestFile } from "./types.ts";
export { discoverScript, discoverMaestro } from "./detectors.ts";
const ignored = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"coverage",
	"vendor",
	"Pods",
	"DerivedData",
	"graphify-out",
	"test-results",
	"playwright-report",
	".idea",
	".vscode",
]);
const posix = (path: string) => path.split(sep).join("/");
/** Walk once for every adapter. Detection only reads source, never imports test modules. */
export async function scanProject(rootInput: string, loaded?: Project): Promise<Catalog> {
	const project = loaded ?? (await loadProject(rootInput));
	const { root, config, adapters } = project;
	const paths: string[] = [];
	const warnings: string[] = [];
	const manifests = new Map<string, Manifest>();
	const excluded = ignore().add(config.exclude);
	if (config.ignoreFile !== false) {
		try {
			excluded.add(await readFile(resolve(root, config.ignoreFile), "utf8"));
		} catch (cause) {
			if (
				(cause as NodeJS.ErrnoException).code !== "ENOENT" ||
				config.ignoreFile !== ".teststudioignore"
			)
				throw new Error(
					`Unable to read ignore file ${config.ignoreFile}: ${(cause as Error).message}`,
					{ cause },
				);
		}
	}
	const git = config.respectGitignore
		? spawnSync(
				"git",
				["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
				{ encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
			)
		: undefined;
	const gitFiles = git?.status === 0 ? new Set(git.stdout.split("\0").filter(Boolean)) : null;
	const gitDirectories = new Set<string>();
	for (const path of gitFiles ?? []) {
		let dir = dirname(path);
		while (dir !== ".") {
			gitDirectories.add(posix(dir));
			dir = dirname(dir);
		}
	}
	async function walk(
		dir: string,
		gitRules: { base: string; matcher: ReturnType<typeof ignore> }[],
	) {
		const entries = await readdir(dir, { withFileTypes: true });
		if (dir !== root && entries.some((entry) => entry.name === ".git")) return;
		// Honor nested .gitignore files even in directories that have not been initialized with Git.
		if (
			config.respectGitignore &&
			!gitFiles &&
			entries.some((entry) => entry.name === ".gitignore")
		) {
			gitRules = [
				...gitRules,
				{
					base: dir,
					matcher: ignore().add(await readFile(join(dir, ".gitignore"), "utf8")),
				},
			];
		}
		for (const entry of entries) {
			const absolute = join(dir, entry.name);
			const path = posix(relative(root, absolute));
			const matchPath = entry.isDirectory() ? `${path}/` : path;
			if (entry.isSymbolicLink() || excluded.ignores(matchPath)) continue;
			let gitIgnored = false;
			for (const rule of gitRules) {
				const match = rule.matcher.test(
					posix(relative(rule.base, absolute)) + (entry.isDirectory() ? "/" : ""),
				);
				if (match.ignored) gitIgnored = true;
				else if (match.unignored) gitIgnored = false;
			}
			if (gitIgnored) continue;
			if (entry.isDirectory()) {
				if (ignored.has(entry.name) || (gitFiles && !gitDirectories.has(path))) continue;
				try {
					await walk(absolute, gitRules);
				} catch (cause) {
					warnings.push(`${path}: ${(cause as Error).message}`);
				}
			} else if (entry.isFile() && (!gitFiles || gitFiles.has(path))) {
				paths.push(path);
				if (entry.name === "package.json") {
					try {
						const value = JSON.parse(await readFile(absolute, "utf8"));
						if (!isRecord(value)) throw new Error("Invalid manifest");
						manifests.set(dir, value);
					} catch {
						warnings.push(`${path}: invalid package manifest`);
					}
				}
			}
		}
	}
	await walk(root, []);
	const pathSet = new Set(paths);
	function nearest(path: string, has: (dir: string) => boolean): string {
		let dir = dirname(join(root, path));
		while (dir !== root) {
			if (has(dir)) return dir;
			dir = dirname(dir);
		}
		return root;
	}
	const libraries = new Set<string>();
	for (const manifest of manifests.values()) {
		for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }))
			if (
				[
					"vitest",
					"jest",
					"@playwright/test",
					"mocha",
					"cypress",
					"bun-types",
					"@types/bun",
				].includes(dep)
			)
				libraries.add(dep.includes("bun") ? "bun" : dep);
	}
	const files: TestFile[] = [];
	for (const path of paths.sort()) {
		try {
			const candidates = adapters.filter((adapter) => adapter.match(path));
			if (!candidates.length && !testPath.test(path)) continue;
			const absolute = join(root, path);
			if ((await stat(absolute)).size > 2000000) {
				warnings.push(`${path}: skipped (larger than 2 MB)`);
				continue;
			}
			const source = await readFile(absolute, "utf8");
			const workspace = nearest(path, (dir) => manifests.has(dir));
			const manifest = manifests.get(workspace);
			const context = {
				root,
				path,
				source,
				workspace: posix(relative(root, workspace)) || ".",
				manifest,
				nearestConfig: (name: string) =>
					posix(
						relative(
							root,
							nearest(path, (dir) =>
								pathSet.has(posix(relative(root, join(dir, name)))),
							),
						),
					) || ".",
			};
			let parsed: DiscoveredFile | null = null;
			let runner = "unknown";
			for (const adapter of candidates) {
				parsed = await adapter.discover(context);
				if (parsed) {
					runner = adapter.id;
					break;
				}
			}
			if (!parsed && testPath.test(path)) {
				const fallback = Object.values(manifest?.scripts ?? {}).some((script) =>
					/\bbun test\b/.test(String(script)),
				)
					? "bun"
					: "unknown";
				const detected = discoverScript(source, path, fallback);
				parsed = detected;
				runner = detected.runner ?? "unknown";
			}
			if (!parsed) continue;
			if (runner !== "unknown") libraries.add(runner);
			files.push({
				...parsed,
				id: path,
				path,
				workspace: context.workspace,
				cwd: parsed.cwd ?? context.workspace,
				name: parsed.name ?? basename(path),
				cases: parsed.cases ?? [],
				runner,
			});
		} catch (cause) {
			warnings.push(`${path}: ${(cause as Error).message}`);
		}
	}
	return {
		root,
		name: config.name ?? manifests.get(root)?.name ?? basename(root),
		scannedAt: new Date().toISOString(),
		files,
		libraries: [...libraries].sort(),
		warnings,
		runners: adapters.map((adapter) => {
			const path =
				executablePath(adapter.executable, root) ??
				files
					.filter((file) => file.runner === adapter.id)
					.map((file) => executablePath(adapter.executable, resolve(root, file.cwd)))
					.find(Boolean) ??
				null;
			return {
				id: adapter.id,
				label: adapter.label,
				executable: adapter.executable,
				supportsIndividualTests: !!adapter.supportsIndividualTests,
				available: !!path,
				path,
			};
		}),
	};
}

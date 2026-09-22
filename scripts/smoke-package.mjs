import assert from "node:assert/strict";
import which from "which";
import { existsSync } from "node:fs";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const repo = fileURLToPath(new URL("../", import.meta.url));
const npm = process.env.npm_execpath;
assert(npm?.endsWith("npm-cli.js"), "Run this check with npm run test:package");
const bunx = which.sync("bunx");
const manifest = JSON.parse(await readFile(join(repo, "package.json"), "utf8"));
const npx = join(dirname(npm), "npx-cli.js");
const temp = await mkdtemp(join(tmpdir(), "test-studio-package-"));
let child;
const artifacts = new Set();
function hasExited(subprocess) {
	return subprocess.exitCode !== null || subprocess.signalCode !== null;
}
function stopProcess(subprocess, signal) {
	try {
		if (process.platform === "win32") subprocess.kill(signal);
		else process.kill(-subprocess.pid, signal);
	} catch (error) {
		if (error.code !== "ESRCH") throw error;
	}
}
function run(args, cwd = repo) {
	return execFileSync(process.execPath, [npm, ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}
async function waitUntil(check, message) {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		const value = await check();
		if (value) return value;
		await delay(50);
	}
	throw new Error(typeof message === "function" ? message() : message);
}
try {
	const packed = JSON.parse(
		run(["pack", "--ignore-scripts", "--json", "--pack-destination", temp]),
	)[0];
	const names = packed.files.map((file) => file.path);
	for (const file of [
		"dist/cli.js",
		"dist/index.d.ts",
		"dist/web/index.html",
		"schema.json",
		"README.md",
		"LICENSE",
		"dist/web/THIRD_PARTY_NOTICES.txt",
	])
		assert(names.includes(file), `Package is missing ${file}`);
	assert(
		names.some((name) => name.startsWith("dist/web/_expo/") && name.endsWith(".js")),
		"Expo bundle missing",
	);
	assert(
		!names.some((name) => name.startsWith("ui/") || name.startsWith("web/")),
		"UI source must not be published",
	);
	assert(!names.some((name) => name.startsWith("tests/") || name.endsWith(".test.ts")));
	assert(!names.some((name) => name.endsWith(".map")), "Source maps must not be published");
	assert((await readFile(join(repo, "dist/cli.js"), "utf8")).startsWith("#!/usr/bin/env node\n"));
	const archive = join(temp, packed.filename);
	const launcherProject = join(temp, "launcher-project");
	await mkdir(launcherProject);
	await writeFile(join(launcherProject, "package.json"), '{"private":true}');
	const launcherEnv = {
		...process.env,
		npm_config_cache: join(temp, "npm-cache"),
		BUN_INSTALL_CACHE_DIR: join(temp, "bun-cache"),
	};
	for (const [executable, args] of [
		[process.execPath, [npx, "--yes", "--package", archive, "test-studio"]],
		[bunx, ["--package", archive, "test-studio"]],
	]) {
		const version = execFileSync(executable, [...args, "--version"], {
			cwd: launcherProject,
			env: launcherEnv,
			encoding: "utf8",
			timeout: 60000,
		});
		assert.equal(version.trim(), manifest.version);
	}
	assert(
		!existsSync(join(launcherProject, "node_modules")),
		"Launchers must not install into the target project",
	);
	const consumer = join(temp, "consumer");
	await mkdir(consumer);
	await writeFile(join(consumer, "package.json"), '{"private":true,"type":"module"}');
	run(
		[
			"install",
			"--ignore-scripts",
			"--omit=dev",
			"--no-audit",
			"--no-fund",
			join(temp, packed.filename),
		],
		consumer,
	);
	const installed = JSON.parse(
		await readFile(join(consumer, "node_modules", manifest.name, "package.json"), "utf8"),
	);
	assert.equal(installed.private, undefined);
	assert.equal(installed.license, "MIT");
	assert.equal(installed.bin["test-studio"], "./dist/cli.js");
	for (const dependency of [
		"expo",
		"react",
		"react-dom",
		"react-native",
		"styled-components",
		"mobx",
		"mobx-react-lite",
		"lucide-react-native",
		"react-native-svg",
	])
		assert(
			!existsSync(join(consumer, "node_modules", dependency)),
			`${dependency} must only be a build dependency`,
		);
	await writeFile(
		join(consumer, "sdk-check.ts"),
		`import { defineAdapter, defineConfig, type Adapter } from ${JSON.stringify(manifest.name)};
const adapter: Adapter = defineAdapter({
 id: 'typed', label: 'Typed adapter', executable: 'node',
 match: path => path.endsWith('.check'),
 discover: () => null,
 command: ({root}) => ({executable: 'node', args: [], cwd: root}),
});
const config = defineConfig({adapters: ['bun', 'maestro']});
void adapter; void config;`,
	);
	execFileSync(
		process.execPath,
		[
			join(consumer, "node_modules/typescript/bin/tsc"),
			"--noEmit",
			"--strict",
			"--module",
			"NodeNext",
			"--moduleResolution",
			"NodeNext",
			"sdk-check.ts",
		],
		{ cwd: consumer, stdio: "inherit" },
	);
	const cli = (args, cwd = consumer) =>
		execFileSync(process.execPath, [npx, "--no-install", "test-studio", ...args], {
			cwd,
			encoding: "utf8",
		});
	assert(cli(["--help"]).includes("test-studio init"));
	assert.equal(cli(["--version"]).trim(), manifest.version);
	cli(["init"]);
	const initialConfig = await readFile(join(consumer, "test-studio.config.json"), "utf8");
	await writeFile(join(consumer, ".teststudioignore"), "skip.check.mjs\n");
	cli(["init"]);
	assert.equal(await readFile(join(consumer, "test-studio.config.json"), "utf8"), initialConfig);
	assert.equal(await readFile(join(consumer, ".teststudioignore"), "utf8"), "skip.check.mjs\n");
	await rm(join(consumer, "test-studio.config.json"));
	await writeFile(
		join(consumer, "test-studio.config.ts"),
		`import { defineConfig } from ${JSON.stringify(manifest.name)};
 const config = defineConfig({ name: 'Packed project', port: 0, adapters: ['./adapter.mjs'] });
 export default config;`,
	);
	await writeFile(
		join(consumer, "adapter.mjs"),
		await readFile(join(repo, "examples/node-checks.mjs")),
	);
	await writeFile(
		join(consumer, "example.check.mjs"),
		"import { test } from 'node:test'; test('packed pass', () => {});\n",
	);
	await writeFile(join(consumer, "skip.check.mjs"), "throw new Error('ignored file ran');");
	// Node and system tools are on PATH; Bun is excluded: the installed executable must not require Bun or Git.
	const bin = join(temp, "bin");
	await mkdir(bin);
	await symlink(process.execPath, join(bin, process.platform === "win32" ? "node.exe" : "node"));
	for (const args of [
		["run", "--runner", "node-checks", "--file", "example.check.mjs"],
		["--no-ui"],
	]) {
		const result = spawnSync(process.execPath, [npx, "--no-install", "test-studio", ...args], {
			cwd: consumer,
			env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
			encoding: "utf8",
			timeout: 15000,
		});
		for (const match of result.stdout.matchAll(/^Reports: (.+)$/gm)) artifacts.add(match[1]);
		assert.equal(result.status, 0, result.stderr + result.stdout);
		assert(result.stdout.includes("PASSED example.check.mjs"));
		assert(!result.stdout.includes("http://"));
	}
	await writeFile(
		join(consumer, "failure.check.mjs"),
		"import {test} from 'node:test'; test('packed failure', () => { throw new Error('expected failure'); });",
	);
	const failure = spawnSync(
		process.execPath,
		[npx, "--no-install", "test-studio", "run", "--file", "failure.check.mjs"],
		{
			cwd: consumer,
			env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
			encoding: "utf8",
			timeout: 15000,
		},
	);
	for (const match of failure.stdout.matchAll(/^Reports: (.+)$/gm)) artifacts.add(match[1]);
	assert.equal(failure.status, 1, failure.stderr + failure.stdout);
	assert(failure.stdout.includes("FAILED failure.check.mjs"));
	await rm(join(consumer, "failure.check.mjs"));
	for (const [executable, args] of [
		[process.execPath, [npx, "--no-install", "test-studio"]],
		[bunx, ["--no-install", "test-studio"]],
	]) {
		child = spawn(executable, args, {
			cwd: consumer,
			env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});
		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		const base = await waitUntil(
			() => {
				if (hasExited(child))
					throw new Error(`CLI exited ${child.exitCode ?? child.signalCode}: ${output}`);
				return output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
			},
			() => `CLI did not start: ${output}`,
		);
		const html = await (await fetch(base)).text();
		const token = html.match(/name="test-studio-token" content="([^"]+)"/)?.[1];
		assert(token, "UI session token missing");
		const headers = { "x-test-studio-token": token, "content-type": "application/json" };
		const api = async (path, body) => {
			const response = await fetch(base + path, {
				headers,
				method: body ? "POST" : "GET",
				...(body ? { body: JSON.stringify(body) } : {}),
			});
			const value = await response.json();
			assert(response.ok, JSON.stringify(value));
			return value;
		};
		const catalog = await api("/api/catalog");
		assert.equal(catalog.name, "Packed project");
		assert.deepEqual(
			catalog.files.map((file) => file.path),
			["example.check.mjs"],
		);
		assert.equal(catalog.runners[0].available, true);
		const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
		assert(scripts.length, "Exported HTML must load a compiled bundle");
		for (const path of scripts) {
			const response = await fetch(new URL(path, base));
			assert.equal(response.status, 200);
			assert(response.headers.get("content-type").includes("javascript"));
			assert((await response.text()).length > 1000);
		}
		assert.equal((await fetch(base + "/ui/App.tsx")).status, 404);
		const { id } = await api("/api/run", { selections: [{ fileId: "example.check.mjs" }] });
		const completed = await waitUntil(async () => {
			const run = await api(`/api/runs/${id}`);
			artifacts.add(run.artifactDir);
			return run.finishedAt ? run : false;
		}, "Packed adapter run did not finish");
		assert.equal(completed.status, "passed", completed.jobs[0].output);
		assert(completed.jobs[0].results.some((result) => result.name.includes("packed pass")));
		stopProcess(child, "SIGTERM");
		await waitUntil(() => hasExited(child), "UI launcher did not stop after SIGTERM");
		await waitUntil(async () => {
			try {
				await fetch(base, { signal: AbortSignal.timeout(500) });
				return false;
			} catch {
				return true;
			}
		}, "UI server still responds after SIGTERM");
		child = undefined;
	}
	const invalid = spawn(
		process.execPath,
		[npx, "--no-install", "test-studio", "--port", "wrong"],
		{ cwd: consumer },
	);
	assert.equal(await new Promise((resolve) => invalid.once("exit", resolve)), 1);
	console.log(
		"Package smoke test passed: npx/bunx tarball launch, init, typed config, SDK exports, terminal exit codes, plugin execution, ignore rules, and compiled UI assets on Node.",
	);
} finally {
	if (child) {
		stopProcess(child, "SIGTERM");
		if (!hasExited(child))
			await Promise.race([
				new Promise((resolve) => child.once("exit", resolve)),
				delay(3000),
			]);
		stopProcess(child, "SIGKILL");
	}
	for (const path of artifacts) await rm(path, { recursive: true, force: true });
	await rm(temp, { recursive: true, force: true });
}

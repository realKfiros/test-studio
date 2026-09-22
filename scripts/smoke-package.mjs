import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const repo = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "test-studio-package-"));
let child;
const artifacts = new Set();
const npm = process.env.npm_execpath;
assert(npm?.endsWith("npm-cli.js"), "Run this check with npm run test:package");
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
		"dist/web/app.js",
		"dist/web/style.css",
		"schema.json",
	])
		assert(names.includes(file), `Package is missing ${file}`);
	assert(!names.some((name) => name.startsWith("tests/") || name.endsWith(".test.ts")));
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
	await writeFile(
		join(consumer, "sdk-check.ts"),
		`import { defineAdapter, defineConfig, type Adapter } from 'test-studio';
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
	const npx = join(dirname(npm), "npx-cli.js");
	const cli = (args, cwd = consumer) =>
		execFileSync(process.execPath, [npx, "--no-install", "test-studio", ...args], {
			cwd,
			encoding: "utf8",
		});
	assert(cli(["--help"]).includes("test-studio init"));
	assert.equal(
		cli(["--version"]).trim(),
		JSON.parse(await readFile(join(repo, "package.json"))).version,
	);
	cli(["init"]);
	const initialConfig = await readFile(join(consumer, "test-studio.config.json"), "utf8");
	await writeFile(join(consumer, ".teststudioignore"), "skip.check.mjs\n");
	cli(["init"]);
	assert.equal(await readFile(join(consumer, "test-studio.config.json"), "utf8"), initialConfig);
	assert.equal(await readFile(join(consumer, ".teststudioignore"), "utf8"), "skip.check.mjs\n");
	await rm(join(consumer, "test-studio.config.json"));
	await writeFile(
		join(consumer, "test-studio.config.ts"),
		`import { defineConfig } from 'test-studio';
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
	child = spawn(process.execPath, [npx, "--no-install", "test-studio"], {
		cwd: consumer,
		env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
		stdio: ["ignore", "pipe", "pipe"],
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
			if (child.exitCode !== null) throw new Error(`CLI exited ${child.exitCode}: ${output}`);
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
	for (const path of ["/app.js", "/style.css"])
		assert.equal((await fetch(base + path)).status, 200);
	const { id } = await api("/api/run", { selections: [{ fileId: "example.check.mjs" }] });
	const completed = await waitUntil(async () => {
		const run = await api(`/api/runs/${id}`);
		artifacts.add(run.artifactDir);
		return run.finishedAt ? run : false;
	}, "Packed adapter run did not finish");
	assert.equal(completed.status, "passed", completed.jobs[0].output);
	assert(completed.jobs[0].results.some((result) => result.name.includes("packed pass")));
	const invalid = spawn(
		process.execPath,
		[npx, "--no-install", "test-studio", "--port", "wrong"],
		{ cwd: consumer },
	);
	assert.equal(await new Promise((resolve) => invalid.once("exit", resolve)), 1);
	console.log(
		"Package smoke test passed: npx, init, typed config, SDK exports, terminal exit codes, plugin execution, ignore rules, and UI assets on Node without Bun.",
	);
} finally {
	if (child && child.exitCode === null) {
		child.kill("SIGTERM");
		await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(3000)]);
		if (child.exitCode === null) child.kill("SIGKILL");
	}
	for (const path of artifacts) await rm(path, { recursive: true, force: true });
	await rm(temp, { recursive: true, force: true });
}

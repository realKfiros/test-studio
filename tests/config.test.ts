import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProject } from "../config.ts";
import { scanProject } from "../discovery.ts";
import { TestRunner } from "../runner.ts";
import { startServer } from "../server.ts";
import type { Run } from "../types.ts";
const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
	for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
async function fixture(files: Record<string, string> = {}) {
	const root = await mkdtemp(join(tmpdir(), "studio-config-test-"));
	cleanup.push(() => rm(root, { recursive: true, force: true }));
	for (const [path, source] of Object.entries(files)) {
		await mkdir(join(root, path, ".."), { recursive: true });
		await writeFile(join(root, path), source);
	}
	return root;
}
async function finished(run: Run) {
	const deadline = Date.now() + 5000;
	while (!run.finishedAt && Date.now() < deadline) await Bun.sleep(20);
	expect(run.finishedAt).toBeDefined();
	cleanup.push(() => rm(run.artifactDir, { recursive: true, force: true }));
}
const source = "import { test } from 'bun:test'; test('example', () => {});";
const plugin = `import { resolve } from 'node:path';
export default (options) => ({
 id: 'custom', label: options.label ?? 'Custom checks', executable: process.execPath,
 supportsIndividualTests: true,
 match: path => path.endsWith('.check'),
 discover: ({ source, path }) => ({ cases: source.trim().split('\\n').map((name, i) => ({ id: path + ':' + i, name, fullName: name, line: i + 1, mode: 'normal', runnable: true })) }),
 command: ({ root, file, selection }) => ({ executable: process.execPath, cwd: resolve(root, file.cwd), args: ['-e', 'console.log(JSON.stringify(' + JSON.stringify(file.cases.filter(item => !selection.caseIds?.length || selection.caseIds.includes(item.id)).map(item => ({ name: item.name, status: item.name === 'bad' ? 'failed' : 'passed', duration: 1 }))) + '))'] }),
 parseResults: ({ output }) => JSON.parse(output.trim())
});`;
describe("project configuration", () => {
	test("provides defaults and validates config errors without silently dropping settings", async () => {
		const root = await fixture();
		expect((await loadProject(root)).adapters.map((adapter) => adapter.id)).toEqual([
			"bun",
			"maestro",
		]);
		for (const value of [
			{ port: -1 },
			{ timeoutMs: 0 },
			{ exclude: true },
			{ adapters: [5] },
			{ typo: true },
		]) {
			await writeFile(join(root, "test-studio.config.json"), JSON.stringify(value));
			await expect(loadProject(root)).rejects.toThrow();
		}
		await writeFile(join(root, "test-studio.config.json"), "{oops");
		await expect(loadProject(root)).rejects.toThrow("test-studio.config.json");
		await expect(loadProject(root, "missing.json")).rejects.toThrow("not found");
	});
	test("loads JSON, ESM, CommonJS, and typed configs; rejects ambiguous automatic discovery", async () => {
		for (const [name, source] of Object.entries({
			"test-studio.config.json": '{"name":"Configured","adapters":[]}',
			"test-studio.config.mjs": 'export default { name: "Configured", adapters: [] };',
			"test-studio.config.cjs": 'module.exports = { name: "Configured", adapters: [] };',
			"test-studio.config.ts":
				'const config: {name: string; adapters: string[]} = { name: "Configured", adapters: [] }; export default config;',
		})) {
			const root = await fixture({ [name]: source });
			expect((await loadProject(root)).config.name).toBe("Configured");
			expect((await loadProject(root)).adapters).toEqual([]);
		}
		const root = await fixture({
			"test-studio.config.json": "{}",
			"test-studio.config.mjs": "export default {port: 0}",
		});
		await expect(loadProject(root)).rejects.toThrow("Multiple");
		expect((await loadProject(root, "test-studio.config.mjs")).config.port).toBe(0);
	});
	test("loads local adapter factories relative to the config and packages from the project", async () => {
		const root = await fixture({
			"config/studio.json": JSON.stringify({
				adapters: [{ use: "./adapter.mjs", options: { label: "Local checks" } }],
			}),
			"config/adapter.mjs": plugin,
			"test-studio.config.json": JSON.stringify({
				adapters: [
					{ use: "test-studio-adapter-fixture", options: { label: "Package checks" } },
				],
			}),
			"node_modules/test-studio-adapter-fixture/package.json":
				'{"type":"module","exports":"./index.mjs"}',
			"node_modules/test-studio-adapter-fixture/index.mjs": plugin,
		});
		expect((await loadProject(root, "config/studio.json")).adapters[0].label).toBe(
			"Local checks",
		);
		expect((await loadProject(root)).adapters[0].label).toBe("Package checks");
		await writeFile(join(root, "test-studio.config.json"), '{"adapters":["bun","bun"]}');
		await expect(loadProject(root)).rejects.toThrow("Duplicate");
		await writeFile(join(root, "test-studio.config.json"), '{"adapters":["./missing.mjs"]}');
		await expect(loadProject(root)).rejects.toThrow("Unable to load adapter");
		await writeFile(
			join(root, "config/adapter.mjs"),
			'export default () => ({ id: "broken" });',
		);
		await expect(loadProject(root, "config/studio.json")).rejects.toThrow("label");
	});
	test("keeps disabled built-ins inspectable without execution controls", async () => {
		const root = await fixture({
			"test-studio.config.json": '{"adapters":[]}',
			"example.test.ts": source,
		});
		const catalog = await scanProject(root);
		expect(catalog.runners).toEqual([]);
		expect(catalog.files[0].runner).toBe("bun");
		await expect(
			new TestRunner(1000, []).start(catalog, [{ fileId: "example.test.ts" }]),
		).rejects.toThrow("no execution adapter");
	});
});
describe("ignore files", () => {
	test("combines config exclusions with gitignore-style comments, anchored paths, and negation; reloads edits", async () => {
		const root = await fixture({
			"test-studio.config.json": '{"exclude":["excluded/**"]}',
			".teststudioignore":
				"# comment\n/drop.test.ts\nignored/*.test.ts\n!ignored/keep.test.ts\n",
			"drop.test.ts": source,
			"nested/drop.test.ts": source,
			"ignored/drop.test.ts": source,
			"ignored/keep.test.ts": source,
			"excluded/no.test.ts": source,
		});
		const project = await loadProject(root);
		expect((await scanProject(root, project)).files.map((file) => file.path)).toEqual([
			"ignored/keep.test.ts",
			"nested/drop.test.ts",
		]);
		await writeFile(join(root, ".teststudioignore"), "*.test.ts\n");
		expect((await scanProject(root, project)).files).toEqual([]);
	});
	test("honors nested gitignore outside Git, permits disabling it, and supports custom ignore paths", async () => {
		const root = await fixture({
			".gitignore": "*.test.ts\n",
			"nested/.gitignore": "!keep.test.ts\n",
			"drop.test.ts": source,
			"nested/keep.test.ts": source,
		});
		expect((await scanProject(root)).files.map((file) => file.path)).toEqual([
			"nested/keep.test.ts",
		]);
		await writeFile(
			join(root, "test-studio.config.json"),
			'{"respectGitignore":false,"ignoreFile":"custom.ignore"}',
		);
		await expect(scanProject(root)).rejects.toThrow("Unable to read ignore");
		await writeFile(join(root, "custom.ignore"), "nested/\n");
		expect((await scanProject(root)).files.map((file) => file.path)).toEqual(["drop.test.ts"]);
		await writeFile(
			join(root, "test-studio.config.json"),
			'{"respectGitignore":false,"ignoreFile":false}',
		);
		expect((await scanProject(root)).files).toHaveLength(2);
	});
	test("never re-includes an ignored directory and allows adapters in hidden/native source directories", async () => {
		const root = await fixture({
			".teststudioignore": "ignored/\n!ignored/keep.test.ts\n",
			"ignored/keep.test.ts": source,
			".checks/one.test.ts": source,
			"android/native.test.ts": source,
		});
		expect((await scanProject(root)).files.map((file) => file.path)).toEqual([
			".checks/one.test.ts",
			"android/native.test.ts",
		]);
	});
});
describe("custom adapter execution", () => {
	test("discovers, selects, executes, and reports a new file type through the local API", async () => {
		const root = await fixture({
			"test-studio.config.json": JSON.stringify({
				name: "Custom project",
				port: 0,
				adapters: ["./adapter.mjs"],
			}),
			"adapter.mjs": plugin,
			"example.check": "good\nbad",
		});
		const app = await startServer(root);
		cleanup.push(() => app.stop());
		const base = `http://127.0.0.1:${app.server.port}`;
		const html = await (await fetch(base)).text();
		const token = html.match(/name="test-studio-token" content="([^"]+)"/)![1];
		const headers = { "x-test-studio-token": token, "content-type": "application/json" };
		const catalog = await (await fetch(base + "/api/catalog", { headers })).json();
		expect(catalog.name).toBe("Custom project");
		expect(catalog.runners[0]).toMatchObject({
			id: "custom",
			label: "Custom checks",
			available: true,
			supportsIndividualTests: true,
		});
		expect(catalog.files[0].cases).toHaveLength(2);
		let response = await fetch(base + "/api/run", {
			method: "POST",
			headers,
			body: JSON.stringify({
				selections: [{ fileId: "example.check", caseIds: ["example.check:0"] }],
			}),
		});
		expect(response.status).toBe(201);
		await finished(app.runner.runs[0]);
		expect(app.runner.runs[0].status).toBe("passed");
		expect(app.runner.runs[0].jobs[0].results.map((item) => item.name)).toEqual(["good"]);
		response = await fetch(base + "/api/run", {
			method: "POST",
			headers,
			body: JSON.stringify({ selections: [{ fileId: "example.check" }] }),
		});
		expect(response.status).toBe(201);
		await finished(app.runner.runs[0]);
		expect(app.runner.runs[0].status).toBe("failed");
		response = await fetch(base + "/api/run", {
			method: "POST",
			headers,
			body: JSON.stringify({
				selections: [{ fileId: "example.check", caseIds: ["missing"] }],
			}),
		});
		expect(response.status).toBe(400);
		expect((await fetch(base + "/app.js")).headers.get("content-type")).toContain("javascript");
		expect(
			(
				await fetch(base + "/api/catalog", {
					headers: { ...headers, host: "attacker.example" },
				})
			).status,
		).toBe(403);
	});
	test("finds project-local executables and preserves arguments literally", async () => {
		const root = await fixture({
			"test-studio.config.json": '{"adapters":["./adapter.mjs"]}',
			"adapter.mjs": plugin.replaceAll(
				"executable: process.execPath",
				'executable: "local-check"',
			),
			"example.check": "good",
		});
		await mkdir(join(root, "node_modules/.bin"), { recursive: true });
		await symlink(process.execPath, join(root, "node_modules/.bin/local-check"));
		const project = await loadProject(root);
		const catalog = await scanProject(root, project);
		expect(catalog.runners[0].available).toBe(true);
		const runner = new TestRunner(1000, project.adapters);
		const run = await runner.start(catalog, [{ fileId: "example.check" }]);
		await finished(run);
		expect(run.status).toBe("passed");
	});
	test("reports discovery errors and times out custom processes using the configured limit", async () => {
		const root = await fixture({
			"test-studio.config.json": '{"adapters":["./adapter.mjs"],"timeoutMs":40}',
			"adapter.mjs": plugin.replace(
				"args: ['-e',",
				"args: ['-e', 'setTimeout(() => {}, 30000);' +",
			),
			"example.check": "good",
		});
		const project = await loadProject(root);
		const runner = new TestRunner(project.config.timeoutMs, project.adapters);
		cleanup.push(() => runner.shutdown());
		const run = await runner.start(await scanProject(root, project), [
			{ fileId: "example.check" },
		]);
		await finished(run);
		expect(run.status).toBe("failed");
		expect(run.jobs[0].output).toContain("40 ms limit");
		project.adapters[0].discover = () => {
			throw new Error("fixture parse error");
		};
		expect((await scanProject(root, project)).warnings[0]).toContain("fixture parse error");
	});
});

describe("Node HTTP server safeguards", () => {
	test("rejects oversized requests and prevents runs after ignore-file refresh fails", async () => {
		const root = await fixture({
			"test-studio.config.json": '{"port":0,"ignoreFile":"custom.ignore"}',
			"custom.ignore": "",
			"example.test.ts": source,
		});
		const app = await startServer(root);
		cleanup.push(() => app.stop());
		const base = `http://127.0.0.1:${app.server.port}`;
		const html = await (await fetch(base)).text();
		const token = html.match(/name="test-studio-token" content="([^"]+)"/)![1];
		const headers = { "x-test-studio-token": token, "content-type": "application/json" };
		const oversized = await fetch(base + "/api/run", {
			method: "POST",
			headers,
			body: "x".repeat(512001),
		});
		expect(oversized.status).toBe(413);
		await rm(join(root, "custom.ignore"));
		const response = await fetch(base + "/api/run", {
			method: "POST",
			headers,
			body: JSON.stringify({ selections: [{ fileId: "example.test.ts" }] }),
		});
		expect(response.status).toBe(400);
		expect(app.runner.runs).toHaveLength(0);
		await writeFile(join(root, "custom.ignore"), "example.test.ts\n");
		const catalog = await (await fetch(base + "/api/scan", { method: "POST", headers })).json();
		expect(catalog.files).toEqual([]);
		expect(catalog.warnings).toEqual([]);
	});
});

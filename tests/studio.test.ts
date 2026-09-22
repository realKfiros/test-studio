import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { discoverMaestro, discoverScript, scanProject } from "../discovery.ts";
import { adapters, displayCommand, parseReport } from "../adapters.ts";
import { TestRunner, validateRequest } from "../runner.ts";
import { startServer } from "../server.ts";
import type { Run } from "../types.ts";
const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
	for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
async function fixture(files: Record<string, string>) {
	const root = await mkdtemp(join(tmpdir(), "studio-test-fixture-"));
	cleanup.push(() => rm(root, { recursive: true, force: true }));
	for (const [path, source] of Object.entries(files)) {
		const target = join(root, path);
		await mkdir(join(target, ".."), { recursive: true });
		await writeFile(target, source);
	}
	return root;
}
async function finished(run: Run) {
	const deadline = Date.now() + 10000;
	while (!run.finishedAt && Date.now() < deadline) await Bun.sleep(20);
	expect(run.finishedAt).toBeDefined();
	cleanup.push(() => rm(run.artifactDir, { recursive: true, force: true }));
	return run;
}
describe("automatic discovery", () => {
	test("reads nested and aliased declarations without interpreting comments or strings", () => {
		const result = discoverScript(
			`import { describe as suite, it as check } from 'bun:test';
      // test('fake', () => {});
      const example = "it('fake string', () => {})";
      suite('outer', () => { suite('inner', () => { check('a [literal].*', () => {}); }); });
      check.skip('not now', () => {});
      check.each([1, 2])('value %i', () => {});
      for (const value of [1, 2]) check('generated', () => {});
      ['one'].forEach(value => check('callback generated', () => {}));`,
			"a.test.ts",
		);
		expect(result.runner).toBe("bun");
		expect(result.cases?.map((item) => [item.fullName, item.runnable])).toEqual([
			["outer inner a [literal].*", true],
			["not now", false],
			["value %i", false],
			["generated", false],
			["callback generated", false],
		]);
	});
	test("inherits skipped suites and recognizes namespace imports", () => {
		const result = discoverScript(
			`import * as b from 'bun:test'; b.describe.skip('later', () => { b.test('example', () => {}); }); b.test.todo('soon');`,
			"b.test.ts",
		);
		expect(result.cases?.map((item) => item.mode)).toEqual(["skip", "todo"]);
	});
	test("requires file-level runs for duplicate names and invalidates renamed test IDs", () => {
		const source =
			"import {test} from 'bun:test'; test('same', () => {}); test('same', () => {});";
		expect(discoverScript(source, "same.test.ts").cases?.map((item) => item.runnable)).toEqual([
			false,
			false,
		]);
		expect(discoverScript(source, "same.test.ts").cases?.[0].id).not.toBe(
			discoverScript(source.replaceAll("same", "changed"), "same.test.ts").cases?.[0].id,
		);
	});
	test("parses Maestro documents and source lines while ignoring ordinary YAML", () => {
		const result = discoverMaestro(
			"appId: host.exp.Exponent\nname: Sign in\ntags: [smoke]\n---\n- launchApp\n- tapOn:\n    id: login\n",
			"flow-ios.yaml",
		);
		expect(result).toMatchObject({
			runner: "maestro",
			name: "Sign in",
			platform: "ios",
			tags: ["smoke"],
		});
		expect(result?.steps?.[0]).toEqual({ name: "launchApp", line: 5 });
		expect(result?.steps?.[1]).toEqual({ name: "tapOn: login", line: 6 });
		expect(discoverMaestro("name: unrelated\n", "ci.yaml")).toBeNull();
	});
	test("finds workspace tests, hidden Maestro folders, additions and deletions; excludes dependencies and nested repos", async () => {
		const root = await fixture({
			"package.json": '{"name":"fixture"}',
			"packages/api/package.json": '{"name":"api"}',
			"packages/api/one.test.ts": "import {test} from 'bun:test'; test('one', () => {});",
			".maestro/login.yaml": "appId: example\n---\n- launchApp\n",
			"node_modules/no.test.ts": "test('no', () => {});",
			"external/.git": "gitdir: elsewhere",
			"external/no.test.ts": "test('no', () => {});",
		});
		await symlink(join(root, "packages/api/one.test.ts"), join(root, "linked.test.ts"));
		let catalog = await scanProject(root);
		expect(catalog.files.map((file) => file.path)).toEqual([
			".maestro/login.yaml",
			"packages/api/one.test.ts",
		]);
		expect(catalog.files[1].workspace).toBe("packages/api");
		await writeFile(
			join(root, "new.test.ts"),
			"import {test} from 'bun:test'; test('new', () => {});",
		);
		await rm(join(root, "packages/api/one.test.ts"));
		catalog = await scanProject(root);
		expect(catalog.files.map((file) => file.path)).toEqual([
			".maestro/login.yaml",
			"new.test.ts",
		]);
		await writeFile(join(root, "test-studio.config.json"), '{"exclude":[".maestro/**"]}');
		expect((await scanProject(root)).files.map((file) => file.path)).toEqual(["new.test.ts"]);
	});
	test("respects gitignore while discovering untracked source tests", async () => {
		const root = await fixture({
			".gitignore": "lib/\n",
			"src/new.test.ts": "import {test} from 'bun:test'; test('new', () => {});",
			"lib/new.test.js": "import {test} from 'bun:test'; test('generated', () => {});",
		});
		expect(spawnSync("git", ["init", "--quiet", root]).status).toBe(0);
		expect((await scanProject(root)).files.map((file) => file.path)).toEqual([
			"src/new.test.ts",
		]);
	});
});
describe("execution adapters", () => {
	test("builds literal Maestro arguments with device/env support and redacted command preview", () => {
		const file = {
			id: "flow.yaml",
			path: "flow with spaces.yaml",
			runner: "maestro",
			cwd: ".",
			workspace: ".",
			name: "flow",
			cases: [],
		};
		const command = adapters[1].command({
			root: "/tmp/project",
			file,
			selection: { fileId: file.id },
			reportPath: "/tmp/report.xml",
			options: { device: "device-1", env: { QUERY: "$(touch /tmp/no); private" } },
		});
		expect(command.args.slice(0, 3)).toEqual(["--device", "device-1", "test"]);
		expect(command.args).toContain("QUERY=$(touch /tmp/no); private");
		expect(displayCommand(command)).not.toContain("private");
		expect(displayCommand(command)).toContain("<redacted>");
		expect(() =>
			adapters[1].command({
				root: "/tmp/project",
				file,
				selection: { fileId: file.id, caseIds: ["step"] },
				reportPath: "report",
				options: {},
			}),
		).toThrow();
	});
	test("parses nested Bun and flat Maestro JUnit reports including failed and skipped cases", () => {
		const results = parseReport(
			'<testsuites><testsuite><testsuite><testcase name="ok &amp; fine" time="0.1"/><testcase name="bad"><failure message="assertion">details</failure></testcase><testcase name="later"><skipped/></testcase></testsuite></testsuite></testsuites>',
		);
		expect(results.map((result) => result.status)).toEqual(["passed", "failed", "skipped"]);
		expect(results[0]).toMatchObject({ name: "ok & fine", duration: 100 });
		expect(results[1].message).toBe("details");
		expect(
			parseReport('<testsuite><testcase name="Flow" time="1.2"/></testsuite>')[0].duration,
		).toBe(1200);
		expect(() => parseReport("<!DOCTYPE x><testcase/>")).toThrow();
	});
	test("runs a selected real Bun test with regex punctuation and excludes its failing sibling", async () => {
		const root = await fixture({
			"nested/example.test.ts":
				"import {describe,test,expect} from 'bun:test'; describe('suite', () => { test('literal [x].*', () => expect(1).toBe(1)); test('sibling', () => expect(1).toBe(2)); });",
		});
		const catalog = await scanProject(root);
		const runner = new TestRunner();
		cleanup.push(() => runner.shutdown());
		const file = catalog.files[0];
		const run = await runner.start(catalog, [{ fileId: file.id, caseIds: [file.cases[0].id] }]);
		await finished(run);
		expect(run.status).toBe("passed");
		expect(run.jobs[0].results.filter((result) => result.status === "passed")).toHaveLength(1);
		expect(run.jobs[0].results.find((result) => result.status === "passed")?.name).toContain(
			"literal [x].*",
		);
		expect(run.jobs[0].results.filter((result) => result.status === "failed")).toHaveLength(0);
		const full = await runner.start(catalog, [{ fileId: file.id }]);
		await finished(full);
		expect(full.status).toBe("failed");
		expect(full.jobs[0].results.filter((result) => result.status === "failed")).toHaveLength(1);
	});
	test("rejects invalid IDs before executing any job and validates request shape", async () => {
		const root = await fixture({
			"a.test.ts": "import {test} from 'bun:test'; test('a', () => {});",
		});
		const runner = new TestRunner();
		await expect(
			runner.start(await scanProject(root), [
				{ fileId: "a.test.ts" },
				{ fileId: "../../other.ts" },
			]),
		).rejects.toThrow();
		expect(runner.runs).toHaveLength(0);
		expect(() => validateRequest({ selections: [] })).toThrow();
		expect(() =>
			validateRequest({
				selections: [{ fileId: "a" }],
				options: { env: { "BAD KEY": "x" } },
			}),
		).toThrow();
	});
	test("cancels an active process, cancels queued jobs, and prevents concurrent runs", async () => {
		const root = await fixture({
			"a.test.ts":
				"import {test} from 'bun:test'; test('wait', async () => { console.log('STARTED'); await Bun.sleep(30000); }, 40000);",
			"b.test.ts": "import {test} from 'bun:test'; test('queued', () => {});",
		});
		const runner = new TestRunner();
		cleanup.push(() => runner.shutdown());
		const catalog = await scanProject(root);
		const run = await runner.start(
			catalog,
			catalog.files.map((file) => ({ fileId: file.id })),
		);
		await expect(runner.start(catalog, [{ fileId: "b.test.ts" }])).rejects.toThrow(
			"already active",
		);
		const deadline = Date.now() + 3000;
		while (!run.jobs[0].output.includes("STARTED") && Date.now() < deadline)
			await Bun.sleep(20);
		expect(run.jobs[0].output).toContain("STARTED");
		runner.stop(run.id);
		await finished(run);
		expect(run.status).toBe("cancelled");
		expect(run.jobs.map((job) => job.status)).toEqual(["cancelled", "cancelled"]);
		expect(run.jobs[1].startedAt).toBeUndefined();
	});
	test("marks jobs without results as failed, even if Bun exits zero", async () => {
		const root = await fixture({ "empty.test.ts": "import 'bun:test';" });
		const runner = new TestRunner();
		const run = await runner.start(await scanProject(root), [{ fileId: "empty.test.ts" }]);
		await finished(run);
		expect(run.status).toBe("failed");
	});
	test("does not report success when a selected name no longer matches", async () => {
		const root = await fixture({
			"a.test.ts": "import {test} from 'bun:test'; test('old name', () => {});",
		});
		const catalog = await scanProject(root);
		await writeFile(
			join(root, "a.test.ts"),
			"import {test} from 'bun:test'; test('new name', () => {});",
		);
		const runner = new TestRunner();
		const run = await runner.start(catalog, [
			{ fileId: "a.test.ts", caseIds: [catalog.files[0].cases[0].id] },
		]);
		await finished(run);
		expect(run.status).toBe("failed");
		expect(run.jobs[0].output).toContain("selected tests did not run");
	});
});
describe("local API boundary", () => {
	test("serves only bundled web assets and injects a unique session into the HTML", async () => {
		const root = await fixture({});
		const app = await startServer(root, 0);
		cleanup.push(() => app.stop());
		const base = `http://127.0.0.1:${app.server.port}`;
		const response = await fetch(base);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("content-security-policy")).toContain("script-src 'self';");
		const html = await response.text();
		expect(html).not.toContain("__SESSION_TOKEN__");
		expect(html).toContain('name="test-studio-token"');
		const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const path of scripts) {
			const asset = await fetch(new URL(path, base));
			expect(asset.status).toBe(200);
			expect(asset.headers.get("content-type")).toContain("javascript");
			expect(asset.headers.get("x-content-type-options")).toBe("nosniff");
		}
		for (const path of [
			"/server.ts",
			"/ui/App.tsx",
			"/package.json",
			"/..%2Fserver.ts",
			"/_expo/missing.js",
		]) {
			expect((await fetch(base + path)).status).toBe(404);
		}
		const head = await fetch(base, { method: "HEAD" });
		expect(head.status).toBe(200);
		expect(await head.text()).toBe("");
		expect(await (await fetch(base + "/index.html")).text()).toBe(html);
	});

	test("requires the session token, rejects foreign origins and limits source access to discovered tests", async () => {
		const root = await fixture({
			"a.test.ts": "import {test} from 'bun:test'; test('a', () => {});",
			"private.txt": "not test source",
		});
		const app = await startServer(root, 0);
		cleanup.push(() => app.stop());
		const base = `http://127.0.0.1:${app.server.port}`;
		const html = await (await fetch(base)).text();
		const token = html.match(/name="test-studio-token" content="([^"]+)"/)![1];
		const headers = { "x-test-studio-token": token };
		expect((await fetch(`${base}/api/catalog`)).status).toBe(403);
		expect(
			(
				await fetch(`${base}/api/catalog`, {
					headers: { ...headers, Origin: "https://example.com" },
				})
			).status,
		).toBe(403);
		expect((await fetch(`${base}/api/catalog`, { headers })).status).toBe(200);
		expect((await fetch(`${base}/api/source?id=private.txt`, { headers })).status).toBe(404);
		expect((await fetch(`${base}/api/source?id=a.test.ts`, { headers })).status).toBe(200);
		const response = await fetch(`${base}/api/run`, {
			method: "POST",
			headers: { ...headers, "Content-Type": "application/json" },
			body: JSON.stringify({ selections: [{ fileId: "a.test.ts" }] }),
		});
		expect(response.status).toBe(201);
		await finished(app.runner.runs[0]);
		expect(app.runner.runs[0].status).toBe("passed");
	});
});

import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const cliPath = fileURLToPath(new URL("../cli.ts", import.meta.url));
const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
	for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
async function fixture(files: Record<string, string>) {
	const root = await mkdtemp(join(tmpdir(), "studio-terminal-"));
	cleanup.push(() => rm(root, { recursive: true, force: true }));
	for (const [path, source] of Object.entries(files)) {
		await mkdir(join(root, path, ".."), { recursive: true });
		await writeFile(join(root, path), source);
	}
	return root;
}
function startCli(root: string, args: string[]) {
	const child = spawn(process.execPath, [cliPath, ...args], {
		cwd: root,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8").on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.setEncoding("utf8").on("data", (chunk) => {
		stderr += chunk;
	});
	const timeout = setTimeout(() => child.kill("SIGKILL"), 10000);
	const done = new Promise<{ code: number | null; stdout: string; stderr: string }>(
		(resolve, reject) => {
			child.once("error", reject);
			child.once("close", (code) => {
				clearTimeout(timeout);
				resolve({ code, stdout, stderr });
			});
		},
	);
	cleanup.push(async () => {
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
		await done;
		for (const match of stdout.matchAll(/^Reports: (.+)$/gm))
			await rm(match[1], { recursive: true, force: true });
	});
	return {
		child,
		done,
		get stdout() {
			return stdout;
		},
	};
}
const passing = "import { test } from 'bun:test'; test('works', () => {});";
describe("terminal CLI", () => {
	test("runs enabled adapters, applies ignore rules, reports unsupported files, and exits without a server", async () => {
		const root = await fixture({
			"test-studio.config.json": '{"name":"Terminal project","adapters":["bun"]}',
			".teststudioignore": "ignored.test.ts\n",
			"one.test.ts": passing,
			"ignored.test.ts": "throw new Error('must not run');",
			"unknown.test.ts": "import {test} from 'vitest'; test('external', () => {});",
		});
		const result = await startCli(root, ["run"]).done;
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("Test Studio · Terminal project · 1 file(s)");
		expect(result.stdout).toContain("RUN [bun] one.test.ts");
		expect(result.stdout).toContain("Tests: 1 passed, 0 failed, 0 skipped");
		expect(result.stderr).toContain("SKIP unknown.test.ts");
		expect(result.stdout).not.toContain("http://");
		expect(result.stdout).not.toContain("ignored.test.ts");
		const reports = result.stdout.match(/^Reports: (.+)$/m)![1];
		expect(await readFile(join(reports, "0.xml"), "utf8")).toContain("works");
	});
	test("selects directories and literal test names without running failing siblings", async () => {
		const root = await fixture({
			"nested/one.test.ts":
				"import {test,expect} from 'bun:test'; test('literal [x].*', () => {}); test('sibling', () => expect(1).toBe(2));",
			"other.test.ts":
				"import {test,expect} from 'bun:test'; test('bad', () => expect(1).toBe(2));",
		});
		const result = await startCli(root, [
			"run",
			root,
			"--runner",
			"bun",
			"--file",
			"nested",
			"--test",
			"literal [x].*",
		]).done;
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("literal [x].*");
		expect(result.stdout).not.toContain("RUN [bun] other.test.ts");
		const failed = await startCli(root, ["run", "--file", "nested/one.test.ts"]).done;
		expect(failed.code).toBe(1);
		expect(failed.stdout).toContain("FAILED nested/one.test.ts");
	});
	test("supports the no-ui alias and repeated file filters", async () => {
		const root = await fixture({
			"a.test.ts": passing,
			"b.test.ts": passing,
			"c.test.ts": passing,
		});
		const result = await startCli(root, [
			"--no-ui",
			"--file",
			"a.test.ts",
			"--file",
			"b.test.ts",
		]).done;
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("2 files passed");
		expect(result.stdout).not.toContain("c.test.ts");
	});
	test("rejects empty or invalid selections and incompatible flags before running anything", async () => {
		const root = await fixture({ "one.test.ts": passing });
		for (const args of [
			["run", "--file", "missing"],
			["run", "--file", "one.test.ts", "--file", "missing"],
			["run", "--file", "../outside"],
			["run", "--runner", "not-enabled"],
			["run", "--test", "missing"],
			["run", "--test", ""],
			["run", "--env", "INVALID"],
			["run", "--port", "4310"],
			["--runner", "bun"],
			["init", "--no-ui"],
		]) {
			const result = await startCli(root, args).done;
			expect(result.code).toBe(1);
			expect(result.stderr).toContain("Test Studio:");
			expect(result.stdout).not.toContain("RUN [");
		}
	}, 15000);
	test("fails when discovery is empty or incomplete, and when no test results are produced", async () => {
		const empty = await fixture({});
		expect((await startCli(empty, ["run"]).done).code).toBe(1);
		const noResults = await fixture({ "empty.test.ts": "import 'bun:test';" });
		const result = await startCli(noResults, ["run"]).done;
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("no test results");
		const broken = await fixture({ "one.test.ts": passing, "bad.yaml": "appId: [broken\n" });
		const discovery = await startCli(broken, ["run"]).done;
		expect(discovery.code).toBe(1);
		expect(discovery.stderr).toContain("Discovery:");
		expect(discovery.stdout).not.toContain("RUN [");
	});
	test("loads custom adapters and passes device and literal environment values", async () => {
		const root = await fixture({
			"config/custom.json": '{"name":"Custom CLI","adapters":["./adapter.mjs"]}',
			"config/adapter.mjs": `export default {
    id: 'fixture', label: 'Fixture', executable: process.execPath,
    match: path => path.endsWith('.flow'), discover: () => ({}),
    command: ({root, options}) => ({executable: process.execPath, cwd:root, args:['-e','console.log(process.env.RECEIVED)'], env:{RECEIVED:JSON.stringify([{name:options.device+'|'+options.env.QUERY,status:'passed',duration:1}])}}),
    parseResults: ({output}) => JSON.parse(output.trim()),
   };`,
			"check.flow": "fixture",
		});
		const result = await startCli(root, [
			"run",
			"--config",
			"config/custom.json",
			"--runner",
			"fixture",
			"--device",
			"sim-1",
			"--env",
			"QUERY=a=b $(literal)",
		]).done;
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("RUN [fixture] check.flow");
		expect(result.stdout).toContain("sim-1|a=b $(literal)");
	});
	test("fails preflight for missing executables before running any selected file", async () => {
		const root = await fixture({
			"test-studio.config.json": '{"adapters":["bun","./missing.mjs"]}',
			"missing.mjs": `export default {
    id:'missing',label:'Missing',executable:'test-studio-nonexistent-fixture',match:path=>path.endsWith('.check'),discover:()=>({}),
    command:({root})=>({executable:'test-studio-nonexistent-fixture',args:[],cwd:root}),
   };`,
			"a.test.ts": passing,
			"z.check": "fixture",
		});
		const result = await startCli(root, ["run"]).done;
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("not on PATH");
		expect(result.stdout).not.toContain("RUN [");
	});
	test("honors configured timeouts", async () => {
		const root = await fixture({
			"test-studio.config.json": '{"timeoutMs":100}',
			"slow.test.ts":
				"import {test} from 'bun:test'; test('wait', async () => { await Bun.sleep(30000); }, 40000);",
		});
		const result = await startCli(root, ["run"]).done;
		expect(result.code).toBe(1);
		expect(result.stdout).toContain("100 ms limit");
	});
	test.each(
		process.platform === "win32"
			? []
			: ([
					["SIGINT", 130],
					["SIGTERM", 143],
				] as const),
	)(
		"streams output and cancels active and queued tests on %s (exit %i)",
		async (signal, code) => {
			const root = await fixture({
				"a.test.ts":
					"import {test} from 'bun:test'; test('wait', async () => { console.log('x'.repeat(110000)); console.log('READY_PID=' + process.pid); await Bun.sleep(30000); }, 40000);",
				"b.test.ts":
					"import {test} from 'bun:test'; test('queued', () => { throw new Error('QUEUED_TEST_RAN'); });",
			});
			const cli = startCli(root, ["run"]);
			const deadline = Date.now() + 5000;
			while (!cli.stdout.includes("READY_PID=") && Date.now() < deadline) await Bun.sleep(20);
			const pid = Number(cli.stdout.match(/READY_PID=(\d+)/)?.[1]);
			expect(pid).toBeGreaterThan(0);
			expect(cli.stdout).toContain("x".repeat(110000));
			cli.child.kill(signal);
			const result = await cli.done;
			expect(result.code).toBe(code);
			expect(result.stdout).toContain("2 cancelled");
			expect(result.stdout).not.toContain("QUEUED_TEST_RAN");
			expect(() => process.kill(pid, 0)).toThrow();
		},
		10000,
	);
});

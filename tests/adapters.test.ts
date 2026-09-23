import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProject } from "../config.ts";
import { scanProject } from "../discovery.ts";
import { defineCommandAdapter } from "../adapters/command-adapter.ts";
import { withDockerCompose } from "../adapters/docker-compose.ts";
import { discoverPest } from "../adapters/pest-discovery.ts";
import createPestAdapter from "../adapters/pest.ts";
import { createPestOutputFormatter } from "../adapters/pest-output.ts";
import { TestRunner } from "../runner.ts";
import type { Adapter } from "../adapter.ts";
import type { TestFile } from "../types.ts";

const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
	for (const dispose of cleanup.splice(0).reverse()) await dispose();
});
async function fixture(files: Record<string, string>) {
	const root = await mkdtemp(join(tmpdir(), "studio-adapters-"));
	cleanup.push(() => rm(root, { recursive: true, force: true }));
	for (const [path, text] of Object.entries(files)) {
		await mkdir(join(root, path, ".."), { recursive: true });
		await writeFile(join(root, path), text);
	}
	return realpath(root);
}
const definition = {
	id: "checks",
	files: ["**/*.check.mjs"],
	executable: "node",
	args: ["--test", "--test-reporter=junit", "--test-reporter-destination={report}", "{file}"],
};
const file: TestFile = {
	id: "tests/ExampleTest.php",
	path: "tests/ExampleTest.php",
	name: "ExampleTest.php",
	runner: "pest",
	workspace: ".",
	cwd: ".",
	cases: [],
};
async function execute(root: string, adapter: Adapter, timeout = 3000) {
	const project = await loadProject(root);
	project.adapters = [adapter];
	const catalog = await scanProject(root, project);
	const runner = new TestRunner(timeout, [adapter]);
	cleanup.push(() => runner.shutdown());
	const run = await runner.start(
		catalog,
		catalog.files.map((file) => ({ fileId: file.id })),
	);
	cleanup.push(() => rm(run.artifactDir, { recursive: true, force: true }));
	return { runner, run };
}

test("inline and module command definitions run real Node tests with literal paths and JUnit", async () => {
	for (const inline of [true, false]) {
		const root = await fixture({
			"test-studio.config.json": JSON.stringify({
				adapters: [inline ? definition : "./adapter.mjs"],
			}),
			"adapter.mjs": `export default ${JSON.stringify(definition)}`,
			"tests/a space;$(echo nope).check.mjs":
				"import {test} from 'node:test'; test('literal path', () => {});",
		});
		const project = await loadProject(root);
		const { runner, run } = await execute(root, project.adapters[0]);
		await runner.wait(run);
		expect(run.status).toBe("passed");
		expect(run.jobs[0].results.some((result) => result.name.includes("literal path"))).toBe(
			true,
		);
	}
});

test("command patterns respect folder boundaries, defaults and custom metadata", async () => {
	const adapter = defineCommandAdapter({
		...definition,
		files: ["tests/**/*.check.mjs"],
		discover: () => ({ tags: ["fast"] }),
	});
	expect(adapter.match("tests/root.check.mjs")).toBe(true);
	expect(adapter.match("tests/nested/example.check.mjs")).toBe(true);
	expect(adapter.match("mytests/root.check.mjs")).toBe(false);
	expect(
		await adapter.discover({
			root: "/repo",
			path: "tests/root.check.mjs",
			source: "",
			workspace: "packages/api",
			nearestConfig: () => ".",
		}),
	).toEqual({ tags: ["fast"], cwd: "packages/api" });
	expect(() => defineCommandAdapter({ ...definition, args: ["{typo}"] })).toThrow("placeholder");
	expect(() => defineCommandAdapter({ ...definition, files: [] })).toThrow("patterns");
	expect(() => defineCommandAdapter({ ...definition, files: ["**/*.{ts,js}"] })).toThrow(
		"patterns",
	);
	expect(() =>
		adapter.command({
			root: "/repo",
			file,
			selection: { fileId: file.id, caseIds: ["one"] },
			reportPath: "/tmp/report",
			options: {},
		}),
	).toThrow("complete files");
});

test("Pest discovery parses nested declarations, it prefixes and groups without matching comments or test bodies", () => {
	const parsed = discoverPest(
		`<?php
 // test('comment', fn () => true);
 $text = "it('string', fn () => true)";
 describe('accounts', function () {
  describe('sign in', function () {
   it('works', function () { test('inside a test'); })->group('smoke');
   test('quote \\' and \\\\', fn () => true);
  });
 })->group('api');
 `,
		file.path,
	)!;
	expect(parsed.cases?.map((item) => item.fullName)).toEqual([
		"`accounts` → `sign in` → it works",
		"`accounts` → `sign in` → quote ' and \\",
	]);
	expect(parsed.cases?.every((item) => item.runnable)).toBe(true);
	expect(parsed.cases?.[0].line).toBe(6);
	expect(parsed.tags?.sort()).toEqual(["api", "smoke"]);
	expect(discoverPest("<?php // test('fake', fn () => true);", "tests/helpers.php")).toBeNull();
});

test("Pest requires full-file runs for computed, dataset, skipped, duplicate, and loop declarations", () => {
	const parsed = discoverPest(
		`<?php
 test('data', fn ($x) => $x)->with([1, 2]);
 test('later', fn () => true)->skip();
 test('same', fn () => true); test('same', fn () => true);
 foreach ([1, 2] as $x) { test('loop', fn () => true); }
 describe($group, function () { test('nested', fn () => true); });
 test($name, fn () => true);
 test('plain', fn () => true);
 `,
		file.path,
	)!;
	expect(parsed.cases?.filter((item) => item.runnable).map((item) => item.name)).toEqual([
		"plain",
	]);
	expect(parsed.note).toContain("whole-file");
	expect(discoverPest("<?php class ExampleTest {}", file.path)?.cases).toEqual([]);
	expect(discoverPest("<?php test(", file.path)?.note).toContain("could not be parsed");
});

test("Pest config discovers files in PHP packages and builds an exact escaped filter", async () => {
	const root = await fixture({
		"test-studio.config.json": JSON.stringify({
			adapters: [
				{
					use: "pest",
					options: {
						files: ["backend/tests/**/*.php"],
						configuration: "backend/phpunit.xml",
					},
				},
			],
		}),
		"backend/composer.json": "{}",
		"backend/tests/ExampleTest.php":
			"<?php it('a/b [value]$', fn () => true); test('a/b [value]$ later', fn () => true);",
		"backend/tests/helper.php": "<?php function helper() {}",
	});
	const project = await loadProject(root);
	const catalog = await scanProject(root, project);
	expect(catalog.files).toHaveLength(1);
	const discovered = catalog.files[0];
	expect(discovered.cwd).toBe("backend");
	const command = project.adapters[0].command({
		root,
		file: discovered,
		reportPath: "/tmp/report.xml",
		selection: { fileId: discovered.id, caseIds: [discovered.cases[0].id] },
		options: {},
	});
	expect(command.args).toEqual([
		join(root, "backend/vendor/bin/pest"),
		"--configuration",
		join(root, "backend/phpunit.xml"),
		"--teamcity",
		"--log-junit",
		"/tmp/report.xml",
		join(root, discovered.path),
		"--filter",
		"/(?:^|::)(?:it a\\/b \\[value\\]\\$)$/u",
	]);
	expect(() => createPestAdapter({ files: [] })).toThrow();
});

const junit = '<testsuite><testcase name="copied" time="0.01"/></testsuite>';
function collectingAdapter(testCode: string, copyCode: string): Adapter {
	return {
		...defineCommandAdapter({
			id: "fixture",
			files: ["*.check"],
			executable: "node",
			args: [],
		}),
		command({ root, reportPath }) {
			return {
				executable: "node",
				cwd: root,
				args: ["-e", testCode],
				collectReport: {
					executable: "node",
					cwd: root,
					args: ["-e", copyCode, reportPath],
				},
			};
		},
	};
}
const writeReport = `require('node:fs').writeFileSync(process.argv[1], ${JSON.stringify(junit)})`;
test("report collection preserves the test exit code and treats collection failures as failures", async () => {
	const root = await fixture({ "example.check": "" });
	for (const [exit, copy, status] of [
		[0, writeReport, "passed"],
		[3, writeReport, "failed"],
		[0, "process.exit(2)", "failed"],
	] as const) {
		const { runner, run } = await execute(
			root,
			collectingAdapter(`process.exit(${exit})`, copy),
		);
		await runner.wait(run);
		expect(run.status).toBe(status);
		expect(run.jobs[0].exitCode).toBe(exit);
		if (copy === writeReport) expect(run.jobs[0].results[0].name).toBe("copied");
		else expect(run.jobs[0].output).toContain("Unable to collect");
	}
});

test("collection is included in cancellation and the job's total timeout", async () => {
	const root = await fixture({ "example.check": "" });
	const adapter = collectingAdapter("", "console.log('collecting'); setInterval(() => {}, 1000)");
	const { runner, run } = await execute(root, adapter);
	const deadline = Date.now() + 2000;
	while (!run.jobs[0].output.includes("collecting") && Date.now() < deadline) await Bun.sleep(10);
	expect(run.jobs[0].output).toContain("collecting");
	runner.stop(run.id);
	await runner.wait(run);
	expect(run.status).toBe("cancelled");
	const timed = await execute(root, adapter, 150);
	await timed.runner.wait(timed.run);
	expect(timed.run.status).toBe("failed");
	expect(timed.run.jobs[0].output).toContain("exceeded");
});

test("a cancelled test process never starts report collection", async () => {
	const root = await fixture({ "example.check": "" });
	const { runner, run } = await execute(
		root,
		collectingAdapter(
			"console.log('testing'); setInterval(() => {}, 1000)",
			"console.log('collecting')",
		),
	);
	const deadline = Date.now() + 2000;
	while (!run.jobs[0].output.includes("testing") && Date.now() < deadline) await Bun.sleep(10);
	runner.stop(run.id);
	await runner.wait(run);
	expect(run.jobs[0].output).not.toContain("collecting");
	expect(run.status).toBe("cancelled");
});

test("Pest reports a completed case while the Docker test process is still running", async () => {
	const root = await fixture({
		"tests/LiveTest.php": "<?php test('first', fn () => true);",
		"node_modules/.bin/docker": `#!/usr/bin/env node
 const fs = require('node:fs');
 const args = process.argv.slice(2);
 if (args.includes('cp')) fs.writeFileSync(args.at(-1), ${JSON.stringify(junit)});
 else if (!args.includes('--teamcity')) setTimeout(() => console.log('all done'), 400);
 else {
   console.log("##teamcity[testStarted name='first']");
   setTimeout(() => {
     console.log("##teamcity[testFinished name='first' duration='100']");
     console.log("##teamcity[testStarted name='second']");
     setTimeout(() => console.log("##teamcity[testFinished name='second' duration='300']"), 350);
   }, 100);
 }
 `,
	});
	await chmod(join(root, "node_modules/.bin/docker"), 0o755);
	const adapter = withDockerCompose(createPestAdapter(), {
		service: "web",
		projectRoot: "/app",
	});
	const { runner, run } = await execute(root, adapter);
	const deadline = Date.now() + 1500;
	while (
		!run.jobs[0].output.includes("PASS first") &&
		run.jobs[0].status === "running" &&
		Date.now() < deadline
	)
		await Bun.sleep(10);
	expect(run.jobs[0].status).toBe("running");
	expect(run.jobs[0].output).toContain("PASS first");
	await runner.wait(run);
	expect(run.status).toBe("passed");
	expect(run.jobs[0].output).toContain("PASS second");
	expect(run.jobs[0].output).not.toContain("##teamcity");
});

test("Docker Compose translates paths and copies reports without a shell or a host PHP requirement", async () => {
	const root = await fixture({
		"tests/ExampleTest.php": "<?php test('works', fn () => true);",
		"node_modules/.bin/docker": `#!/usr/bin/env node
 const fs = require('node:fs');
 const args = process.argv.slice(2);
 fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
 if (args.includes('cp')) fs.writeFileSync(args.at(-1), ${JSON.stringify(junit)});
 `,
	});
	await chmod(join(root, "node_modules/.bin/docker"), 0o755);
	const adapter = withDockerCompose(createPestAdapter({ configuration: "tests/phpunit.xml" }), {
		service: "web",
		projectRoot: "/app/a project",
		file: "../compose file.yml",
	});
	const { runner, run } = await execute(root, adapter);
	await runner.wait(run);
	expect(run.status).toBe("passed");
	const calls = (await readFile(join(root, "calls.jsonl"), "utf8"))
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as string[]);
	expect(calls[0].slice(0, 9)).toEqual([
		"compose",
		"-f",
		join(root, "../compose file.yml"),
		"exec",
		"-T",
		"--workdir",
		"/app/a project",
		"web",
		"php",
	]);
	expect(calls[0]).toContain("/app/a project/tests/ExampleTest.php");
	const containerReport = calls[0][calls[0].indexOf("--log-junit") + 1];
	expect(containerReport).toMatch(/^\/tmp\/test-studio-.+-0\.xml$/);
	expect(calls[1]).toEqual([
		"compose",
		"-f",
		join(root, "../compose file.yml"),
		"cp",
		`web:${containerReport}`,
		join(run.artifactDir, "0.xml"),
	]);
	expect(run.jobs[0].results[0].name).toBe("copied");
});

test("Pest live output formats split, escaped, failed, and skipped events", () => {
	const formatter = createPestOutputFormatter();
	expect(formatter.write("##teamcity[testStarted name='fails || ")).toBe("");
	expect(formatter.write("here' flowId='1']\n")).toBe("RUN fails | here\n");
	expect(
		formatter.write(
			"##teamcity[testFailed name='fails || here' message='oops|nmore' flowId='1']\n",
		),
	).toBe("FAIL fails | here: oops\n");
	expect(
		formatter.write("##teamcity[testFinished name='fails || here' duration='31' flowId='1']\n"),
	).toBe("");
	expect(formatter.write("##teamcity[testStarted name='skipped' flowId='1']\n")).toBe(
		"RUN skipped\n",
	);
	expect(
		formatter.write("##teamcity[testIgnored name='skipped' message='not ready' flowId='1']\n"),
	).toBe("SKIP skipped: not ready\n");
	expect(formatter.write("##teamcity[testFinished name='skipped' flowId='1']\n")).toBe("");
	expect(formatter.write("Tests: 2")).toBe("");
	expect(formatter.end()).toBe("Tests: 2");
});

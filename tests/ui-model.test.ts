import { describe, expect, test } from "bun:test";
import { discoverScript } from "../detectors.ts";
import type { Catalog, TestFile } from "../types.ts";
import {
	defaultFilters,
	filterFiles,
	reconcileSelection,
	runOptions,
	selectionsFor,
	toggleCase,
} from "../ui/model.ts";

const file: TestFile = {
	id: "tests/example.test.ts",
	name: "example.test.ts",
	path: "tests/example.test.ts",
	workspace: ".",
	cwd: ".",
	runner: "bun",
	cases: discoverScript(
		"import {test} from 'bun:test'; test('first', () => {}); test('second', () => {}); test.skip('later', () => {});",
		"tests/example.test.ts",
	).cases!,
};
const catalog: Catalog = {
	name: "Example",
	root: "/project",
	scannedAt: new Date().toISOString(),
	warnings: [],
	libraries: ["bun"],
	files: [file],
	runners: [
		{
			id: "bun",
			label: "Bun",
			executable: "bun",
			supportsIndividualTests: true,
			available: true,
			path: "/bin/bun",
		},
	],
};

describe("UI selection across discovery updates", () => {
	test("unchecking a test from a whole-file selection preserves the other runnable tests", () => {
		const previous = new Map([[file.id, null]]);
		const next = toggleCase(previous, file, file.cases[0].id, false);
		expect(selectionsFor(next)).toEqual([{ fileId: file.id, caseIds: [file.cases[1].id] }]);
		expect(previous.get(file.id)).toBeNull();
		expect(toggleCase(next, file, file.cases[1].id, false).size).toBe(0);
	});
	test("a rescan prunes removed tests and never broadens a partial selection to the whole file", () => {
		const selected = new Map([
			[file.id, new Set([file.cases[0].id])],
			["removed.test.ts", null],
		]);
		const changed = { ...catalog, files: [{ ...file, cases: file.cases.slice(1) }] };
		expect(reconcileSelection(selected, changed).size).toBe(0);
		expect(selected.size).toBe(2);
		expect(reconcileSelection(new Map([[file.id, null]]), changed).has(file.id)).toBe(true);
	});
	test("disabled individual selection cannot silently become a file-level run", () => {
		const selected = new Map([[file.id, new Set([file.cases[0].id])]]);
		expect(reconcileSelection(selected, { ...catalog, runners: [] }).size).toBe(0);
		expect(
			reconcileSelection(selected, {
				...catalog,
				runners: [{ ...catalog.runners[0], supportsIndividualTests: false }],
			}).size,
		).toBe(0);
	});
});
test("UI filters combine workspace, platform, runner, and case-insensitive test or tag search", () => {
	const flow = {
		...file,
		id: "flow.yml",
		path: "mobile/flow.yml",
		workspace: "mobile",
		runner: "maestro",
		platform: "ios",
		cases: [],
		tags: ["smoke"],
	};
	const data = { ...catalog, files: [file, flow] };
	expect(filterFiles(data, { ...defaultFilters, query: " SECOND " })).toEqual([file]);
	expect(
		filterFiles(data, {
			query: " SMOKE ",
			workspace: "mobile",
			runner: "maestro",
			platform: "ios",
		}),
	).toEqual([flow]);
	expect(filterFiles(data, { ...defaultFilters, query: "smoke", platform: "android" })).toEqual(
		[],
	);
});
test("run settings preserve equals signs in values and reject malformed names", () => {
	expect(runOptions(" device-1 ", "TOKEN=a=b\nMODE=local\n")).toEqual({
		device: "device-1",
		env: { TOKEN: "a=b", MODE: "local" },
	});
	expect(() => runOptions("", "invalid line")).toThrow("NAME=value");
	expect(() => runOptions("", "BAD-NAME=value")).toThrow("NAME=value");
});

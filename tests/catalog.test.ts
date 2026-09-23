import { expect, test } from "bun:test";
import { fileTree, inFolder, latestStatuses, selectionState } from "../ui/catalog.ts";
import { defaultFilters, filterFiles } from "../ui/model.ts";
import type { Catalog, Run, TestFile } from "../types.ts";
const file = (path: string): TestFile => ({
	id: path,
	path,
	name: path,
	runner: "bun",
	workspace: ".",
	cwd: ".",
	cases: [],
	tags: ["smoke"],
});
test("folder tree preserves parent structure, puts folders first, and sorts file names naturally", () => {
	const files = ["tests/test10.ts", "root.test.ts", "tests/test2.ts", "tests/unit/a.ts"].map(
		file,
	);
	const tree = fileTree(files);
	expect(tree.map((node) => node.path)).toEqual(["tests", "root.test.ts"]);
	const folder = tree[0];
	if (folder.kind !== "folder") throw new Error("Expected a folder");
	expect(folder.children.map((node) => node.path)).toEqual([
		"tests/unit",
		"tests/test2.ts",
		"tests/test10.ts",
	]);
	expect(folder.files).toHaveLength(3);
	expect(inFolder(file("tests-extra/no.ts"), "tests")).toBe(false);
	expect(selectionState(files, new Map([[files[0].id, new Set(["case"])]]))).toEqual({
		checked: false,
		indeterminate: true,
	});
});
test("latest status is per file and combines with exact tag and text filters", () => {
	const files = [
		file("tests/a.ts"),
		file("tests/b.ts"),
		{ ...file("tests/c.ts"), tags: ["slow"] },
	];
	const run = (startedAt: number, status: "failed" | "passed", selected: TestFile[]): Run => ({
		id: String(startedAt),
		status,
		startedAt,
		artifactDir: "",
		jobs: selected.map((file) => ({
			id: file.id,
			file,
			status,
			selection: { fileId: file.id },
			command: "",
			output: "",
			results: [],
		})),
	});
	const statuses = latestStatuses([
		run(10, "failed", files.slice(0, 2)),
		run(20, "passed", [files[0]]),
	]);
	const catalog: Catalog = {
		root: "/root",
		name: "project",
		scannedAt: "",
		files,
		libraries: [],
		runners: [],
		warnings: [],
	};
	expect(
		filterFiles(catalog, { ...defaultFilters, tag: "smoke", status: "failed" }, statuses),
	).toEqual([files[1]]);
	expect(filterFiles(catalog, { ...defaultFilters, status: "unrun" }, statuses)).toEqual([
		files[2],
	]);
	expect(
		filterFiles(catalog, { ...defaultFilters, tag: "slow", status: "failed" }, statuses),
	).toEqual([]);
	expect(
		filterFiles(catalog, { ...defaultFilters, query: "a.ts", status: "passed" }, statuses),
	).toEqual([files[0]]);
});

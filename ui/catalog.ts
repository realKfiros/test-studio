import type { Run, Status, TestFile } from "../types.ts";
import type { RunSummary, Selected } from "./model.ts";

export type FileNode = { kind: "file"; path: string; name: string; file: TestFile };
export type FolderNode = {
	kind: "folder";
	path: string;
	name: string;
	children: CatalogNode[];
	files: TestFile[];
};
export type CatalogNode = FileNode | FolderNode;

export function fileTree(files: TestFile[]): CatalogNode[] {
	const root: FolderNode = { kind: "folder", path: "", name: "", children: [], files: [] };
	const folders = new Map([["", root]]);
	for (const file of files) {
		const parts = file.path.split("/");
		let parent = root;
		for (let i = 0; i < parts.length - 1; i++) {
			const path = parts.slice(0, i + 1).join("/");
			let folder = folders.get(path);
			if (!folder) {
				folder = { kind: "folder", path, name: parts[i], children: [], files: [] };
				folders.set(path, folder);
				parent.children.push(folder);
			}
			folder.files.push(file);
			parent = folder;
		}
		parent.children.push({ kind: "file", path: file.path, name: parts.at(-1)!, file });
	}
	for (const folder of folders.values())
		folder.children.sort((a, b) =>
			a.kind === b.kind
				? a.name.localeCompare(b.name, undefined, { numeric: true })
				: a.kind === "folder"
					? -1
					: 1,
		);
	return root.children;
}
export function inFolder(file: TestFile, path: string) {
	return file.path.startsWith(`${path}/`);
}
export function selectionState(files: TestFile[], selected: Selected) {
	const checked = files.length > 0 && files.every((file) => selected.get(file.id) === null);
	return { checked, indeterminate: !checked && files.some((file) => selected.has(file.id)) };
}
/** The newest run containing each file wins, even if an older run finished later. */
export function latestStatuses(runs: (RunSummary | Run)[]): Map<string, Status> {
	const result = new Map<string, Status>();
	for (const run of [...runs].sort((a, b) => b.startedAt - a.startedAt))
		for (const job of run.jobs)
			if (!result.has(job.file.id)) result.set(job.file.id, job.status);
	return result;
}

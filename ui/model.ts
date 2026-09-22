import type { Catalog, Job, Run, RunOptions, Selection, TestFile } from "../types.ts";

export type RunSummary = Omit<Run, "jobs"> & {
	jobs: (Pick<
		Job,
		"id" | "selection" | "status" | "command" | "startedAt" | "finishedAt" | "exitCode"
	> & {
		file: Pick<TestFile, "id" | "name" | "runner" | "path">;
		resultCounts: { passed: number; failed: number; skipped: number };
	})[];
};
export type Selected = Map<string, Set<string> | null>;
export type Filters = { runner: string; workspace: string; query: string; platform: string };
export const defaultFilters: Filters = {
	runner: "all",
	workspace: "all",
	query: "",
	platform: "all",
};

export function filterFiles(catalog: Catalog | null, filters: Filters) {
	const query = filters.query.trim().toLowerCase();
	return (catalog?.files ?? []).filter(
		(file) =>
			(filters.runner === "all" || file.runner === filters.runner) &&
			(filters.workspace === "all" || file.workspace === filters.workspace) &&
			(filters.platform === "all" || file.platform === filters.platform) &&
			(!query ||
				[
					file.path,
					file.name,
					...file.cases.map((test) => test.fullName),
					...(file.tags ?? []),
				]
					.join(" ")
					.toLowerCase()
					.includes(query)),
	);
}
export function reconcileSelection(selected: Selected, catalog: Catalog): Selected {
	const next: Selected = new Map();
	for (const [id, cases] of selected) {
		const file = catalog.files.find((file) => file.id === id);
		const runner = catalog.runners.find((runner) => runner.id === file?.runner);
		if (!file || !runner) continue;
		if (cases === null) next.set(id, null);
		else if (runner.supportsIndividualTests) {
			const valid = new Set(
				file.cases
					.filter((test) => test.runnable && cases.has(test.id))
					.map((test) => test.id),
			);
			if (valid.size) next.set(id, valid);
		}
	}
	return next;
}
export function toggleCase(
	selected: Selected,
	file: TestFile,
	caseId: string,
	checked: boolean,
): Selected {
	const next = new Map(selected);
	const previous = next.get(file.id);
	const cases = new Set(
		previous === null
			? file.cases.filter((test) => test.runnable).map((test) => test.id)
			: previous,
	);
	if (checked) cases.add(caseId);
	else cases.delete(caseId);
	if (cases.size) next.set(file.id, cases);
	else next.delete(file.id);
	return next;
}
export const selectionsFor = (selected: Selected): Selection[] =>
	[...selected].map(([fileId, cases]) => ({ fileId, ...(cases ? { caseIds: [...cases] } : {}) }));
export function runOptions(device: string, variables: string): RunOptions {
	const env: Record<string, string> = {};
	for (const line of variables.split("\n")) {
		if (!line.trim()) continue;
		const index = line.indexOf("=");
		if (index < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(line.slice(0, index).trim()))
			throw new Error("Flow variables must use NAME=value, one per line.");
		env[line.slice(0, index).trim()] = line.slice(index + 1);
	}
	return { device: device.trim() || undefined, env };
}
export const workspaceName = (workspace: string) =>
	workspace === "." ? "Project root" : workspace;
export const runName = (run: { jobs: { file: { name: string } }[] }) =>
	run.jobs.length === 1 ? run.jobs[0].file.name : `${run.jobs.length} files`;
export const duration = (ms: number) =>
	ms < 1000
		? `${Math.round(ms)}ms`
		: ms < 60000
			? `${(ms / 1000).toFixed(1)}s`
			: `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Project } from "./config.ts";
import { scanProject } from "./discovery.ts";
import { TestRunner, validateRunOptions } from "./runner.ts";
import type { Catalog, Selection } from "./types.ts";

export type TerminalOptions = {
	runners?: string[];
	files?: string[];
	test?: string;
	device?: string;
	env?: string[];
};
function selectionsFor(catalog: Catalog, options: TerminalOptions): Selection[] {
	const runners = options.runners ?? [];
	for (const id of runners) {
		if (!catalog.runners.some((runner) => runner.id === id))
			throw new Error(
				`Adapter "${id}" is not enabled. Enabled adapters: ${catalog.runners.map((runner) => runner.id).join(", ") || "none"}.`,
			);
	}
	let files = catalog.files.filter((file) => !runners.length || runners.includes(file.runner));
	if (options.files?.length) {
		const paths = options.files.map((path) => {
			if (!path.trim()) throw new Error("--file requires a file or directory path.");
			const inside = relative(catalog.root, resolve(catalog.root, path));
			if (isAbsolute(inside) || inside === ".." || inside.startsWith(`..${sep}`))
				throw new Error("--file paths must be inside the project.");
			return inside.split(sep).join("/");
		});
		const matches = (filePath: string, path: string) =>
			!path || filePath === path || filePath.startsWith(`${path}/`);
		for (let i = 0; i < paths.length; i++) {
			if (!files.some((file) => matches(file.path, paths[i])))
				throw new Error(
					`No discovered files match --file "${options.files[i]}" with the selected adapters.`,
				);
		}
		files = files.filter((file) => paths.some((path) => matches(file.path, path)));
	}
	const selections: Selection[] = [];
	for (const file of files) {
		const cases =
			options.test === undefined
				? undefined
				: file.cases.filter((item) => item.fullName.includes(options.test!));
		if (cases && !cases.length) continue;
		const runner = catalog.runners.find((runner) => runner.id === file.runner);
		if (!runner) {
			if (options.files?.length || options.test !== undefined)
				throw new Error(`No enabled adapter for ${file.path} (${file.runner}).`);
			console.error(`SKIP ${file.path}: no enabled adapter for ${file.runner}.`);
			continue;
		}
		if (cases && (!runner.supportsIndividualTests || cases.some((item) => !item.runnable)))
			throw new Error(
				`Cannot select individual tests in ${file.path}. Run the file without --test.`,
			);
		selections.push({
			fileId: file.id,
			...(cases ? { caseIds: cases.map((item) => item.id) } : {}),
		});
	}
	if (!selections.length)
		throw new Error(
			options.test === undefined
				? "No runnable test files matched. Check the adapters, paths, and ignore rules."
				: "No selectable tests matched --test. It matches static test names, not flow steps or filenames.",
		);
	return selections;
}
/** Run the same discovery and queue as the UI without starting an HTTP server. */
export async function runInTerminal(project: Project, options: TerminalOptions): Promise<number> {
	if (options.test !== undefined && !options.test.trim())
		throw new Error("--test requires a non-empty test name.");
	const env = Object.fromEntries(
		(options.env ?? []).map((entry) => {
			const equals = entry.indexOf("=");
			if (equals < 1) throw new Error("Use --env NAME=value.");
			return [entry.slice(0, equals), entry.slice(equals + 1)];
		}),
	);
	const runOptions = validateRunOptions({ device: options.device, env });
	const catalog = await scanProject(project.root, project);
	for (const warning of catalog.warnings) console.error(`Discovery: ${warning}`);
	if (catalog.warnings.length)
		throw new Error(
			"Discovery reported errors. Resolve them before running from the terminal.",
		);
	const selections = selectionsFor(catalog, options);
	let interrupted = 0;
	let outputEndedWithNewline = true;
	const runner = new TestRunner(project.config.timeoutMs, project.adapters, (event) => {
		if (event.type === "job-started") {
			console.log(`\nRUN [${event.job.file.runner}] ${event.job.file.path}`);
			outputEndedWithNewline = true;
		} else if (event.type === "output") {
			process.stdout.write(event.text);
			if (event.text) outputEndedWithNewline = event.text.endsWith("\n");
		} else {
			if (!outputEndedWithNewline) process.stdout.write("\n");
			for (const result of event.job.results) {
				console.log(
					`  ${result.status.toUpperCase()} ${result.name} (${Math.round(result.duration)}ms)`,
				);
				if (result.status === "failed" && result.message) console.log(result.message);
			}
			console.log(`${event.job.status.toUpperCase()} ${event.job.file.path}`);
		}
	});
	const onInterrupt = () => stop(130);
	const onTerminate = () => stop(143);
	function stop(code: number) {
		if (interrupted) return;
		interrupted = code;
		console.error("\nCancelling run…");
		runner.shutdown();
	}
	process.on("SIGINT", onInterrupt);
	process.on("SIGTERM", onTerminate);
	try {
		console.log(`Test Studio · ${catalog.name} · ${selections.length} file(s)`);
		const run = await runner.start(catalog, selections, runOptions);
		await runner.wait(run);
		const results = run.jobs.flatMap((job) => job.results);
		const count = (status: string) =>
			results.filter((result) => result.status === status).length;
		const fileCount = (status: string) =>
			run.jobs.filter((job) => job.status === status).length;
		console.log(
			`\n${run.status.toUpperCase()} · ${fileCount("passed")} files passed, ${fileCount("failed")} failed, ${fileCount("cancelled")} cancelled`,
		);
		console.log(
			`Tests: ${count("passed")} passed, ${count("failed")} failed, ${count("skipped")} skipped`,
		);
		console.log(`Duration: ${((run.finishedAt! - run.startedAt) / 1000).toFixed(2)}s`);
		console.log(`Reports: ${run.artifactDir}`);
		return interrupted || (run.status === "passed" ? 0 : 1);
	} finally {
		process.off("SIGINT", onInterrupt);
		process.off("SIGTERM", onTerminate);
		runner.shutdown();
	}
}

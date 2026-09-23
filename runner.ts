import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { adapters as builtins, displayCommand, executablePath, parseReport } from "./adapters.ts";
import type { Adapter, Command } from "./adapter.ts";
import type { Catalog, Job, Run, RunOptions, Selection } from "./types.ts";
export function validateRequest(value: unknown): { selections: Selection[]; options: RunOptions } {
	if (
		!value ||
		typeof value !== "object" ||
		!("selections" in value) ||
		!Array.isArray(value.selections) ||
		!value.selections.length ||
		value.selections.length > 500
	)
		throw new Error("Select between 1 and 500 files.");
	const seen = new Set();
	for (const selection of value.selections) {
		if (!selection || typeof selection.fileId !== "string" || seen.has(selection.fileId))
			throw new Error("Invalid or duplicate file selection.");
		seen.add(selection.fileId);
		if (
			selection.caseIds !== undefined &&
			(!Array.isArray(selection.caseIds) ||
				selection.caseIds.length > 5000 ||
				selection.caseIds.some((id: unknown) => typeof id !== "string"))
		)
			throw new Error("Invalid test selection.");
	}
	return {
		selections: value.selections,
		options: validateRunOptions("options" in value ? value.options : undefined),
	};
}
export function validateRunOptions(value: unknown): RunOptions {
	const options = value ?? {};
	if (typeof options !== "object" || Array.isArray(options))
		throw new Error("Invalid run options.");
	const { device, env } = options as Record<string, unknown>;
	if (
		device !== undefined &&
		(typeof device !== "string" || device.length > 250 || /[\r\n\0]/.test(device))
	)
		throw new Error("Invalid device identifier.");
	if (
		env !== undefined &&
		(!env || typeof env !== "object" || Array.isArray(env) || Object.keys(env).length > 50)
	)
		throw new Error("Invalid flow environment.");
	for (const [key, value] of Object.entries(env ?? {})) {
		if (
			!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ||
			typeof value !== "string" ||
			value.length > 4096 ||
			value.includes("\0")
		)
			throw new Error("Flow environment must use NAME=value entries.");
	}
	return { device: device as string | undefined, env: env as Record<string, string> | undefined };
}
export type RunnerEvent =
	{ type: "job-started" | "job-finished"; job: Job } | { type: "output"; job: Job; text: string };
export class TestRunner {
	runs: Run[] = [];
	private child?: ChildProcess;
	private current?: Run;
	private stopChild?: () => void;
	private completions = new WeakMap<Run, Promise<void>>();
	constructor(
		private timeoutMs = 30 * 60000,
		private adapters: Adapter[] = builtins,
		private onEvent?: (event: RunnerEvent) => void,
	) {}
	async start(catalog: Catalog, selections: Selection[], options: RunOptions = {}): Promise<Run> {
		if (this.current)
			throw new Error("A run is already active. Stop it or wait for it to finish.");
		const files = selections.map((selection) => {
			const file = catalog.files.find((file) => file.id === selection.fileId);
			if (!file)
				throw new Error("A selected file is no longer in the catalog. Refresh discovery.");
			if (!this.adapters.some((adapter) => adapter.id === file.runner))
				throw new Error(`${file.runner} is detected but has no execution adapter yet.`);
			if (!catalog.runners.find((runner) => runner.id === file.runner)?.available)
				throw new Error(
					`${file.runner} is not on PATH. Install it and restart Test Studio.`,
				);
			// Validate the entire request before launching any process.
			const adapter = this.adapters.find((adapter) => adapter.id === file.runner)!;
			if (
				selection.caseIds?.length &&
				(!adapter.supportsIndividualTests ||
					selection.caseIds.some(
						(id) => !file.cases.find((item) => item.id === id)?.runnable,
					))
			)
				throw new Error(
					"Invalid test selection. This adapter or test requires a file-level run.",
				);
			validateCommand(
				adapter.command({
					root: catalog.root,
					file,
					selection,
					reportPath: join(tmpdir(), "report.xml"),
					options,
				}),
			);
			return file;
		});
		// Reserve synchronously to prevent simultaneous requests launching overlapping runs.
		const run: Run = {
			id: crypto.randomUUID(),
			status: "queued",
			startedAt: Date.now(),
			jobs: [],
			artifactDir: "",
		};
		this.current = run;
		try {
			run.artifactDir = await mkdtemp(join(tmpdir(), "test-studio-"));
			run.jobs = files.map((file, index) => ({
				id: String(index),
				file,
				selection: selections[index],
				status: run.status === "cancelled" ? "cancelled" : "queued",
				command: "",
				output: "",
				results: [],
			}));
			this.runs.unshift(run);
			const stale = this.runs.splice(20);
			for (const item of stale)
				void rm(item.artifactDir, { recursive: true, force: true }).catch(() => {});
			this.completions.set(run, this.execute(catalog.root, run, options));
			return run;
		} catch (error) {
			this.current = undefined;
			throw error;
		}
	}
	/** Wait for process cleanup and final reports, without starting another run. */
	async wait(run: Run): Promise<Run> {
		const completion = this.completions.get(run);
		if (!completion) throw new Error("This run does not belong to this runner.");
		await completion;
		return run;
	}
	stop(id: string) {
		if (!this.current || this.current.id !== id)
			throw new Error("This run is no longer active.");
		this.current.status = "cancelled";
		for (const job of this.current.jobs) if (job.status === "queued") job.status = "cancelled";
		this.stopChild?.();
	}
	shutdown() {
		if (this.current) this.stop(this.current.id);
	}
	private async execute(root: string, run: Run, options: RunOptions) {
		const cancelled = () => run.status === "cancelled";
		if (!cancelled()) run.status = "running";
		for (const job of run.jobs) {
			if (cancelled()) break;
			job.status = "running";
			job.startedAt = Date.now();
			this.onEvent?.({ type: "job-started", job });
			const append = (chunk: string) => {
				if (!chunk) return;
				// eslint-disable-next-line no-control-regex -- Runner output contains ANSI escape sequences.
				const text = chunk.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
				job.output = (job.output + text).slice(-100000);
				this.onEvent?.({ type: "output", job, text });
			};
			try {
				const actual = await realpath(resolve(root, job.file.path));
				const inside = relative(root, actual);
				if (inside === ".." || inside.startsWith(`..${sep}`))
					throw new Error("Test file resolves outside the project.");
				if (cancelled()) {
					job.status = "cancelled";
					job.finishedAt = Date.now();
					this.onEvent?.({ type: "job-finished", job });
					break;
				}
				const report = join(run.artifactDir, `${job.id}.xml`);
				const adapter = this.adapters.find((adapter) => adapter.id === job.file.runner)!;
				const command = adapter.command({
					root,
					file: job.file,
					selection: job.selection,
					reportPath: report,
					options,
				});
				validateCommand(command);
				job.command = displayCommand(command);
				const formatter = adapter.createOutputFormatter?.();
				let timedOut = false;
				for (const [index, step] of [
					command,
					...(command.collectReport ? [command.collectReport] : []),
				].entries()) {
					if (cancelled() || timedOut) break;
					const executable = executablePath(step.executable, step.cwd);
					if (!executable) throw new Error(`Executable not found: ${step.executable}`);
					// Never invoke a shell: paths, device IDs, and environment values are literal arguments.
					const child = spawn(executable, step.args, {
						cwd: step.cwd,
						env: { ...process.env, ...step.env, FORCE_COLOR: "0", NO_COLOR: "1" },
						stdio: ["ignore", "pipe", "pipe"],
						detached: process.platform !== "win32",
					});
					this.child = child;

					child
						.stdout!.setEncoding("utf8")
						.on("data", (chunk: string) =>
							append(index === 0 && formatter ? formatter.write(chunk) : chunk),
						);
					child.stderr!.setEncoding("utf8").on("data", append);
					let killTimer: ReturnType<typeof setTimeout> | undefined;
					const signal = (name: NodeJS.Signals) => {
						try {
							if (child.pid && process.platform !== "win32")
								process.kill(-child.pid, name);
							else child.kill(name);
						} catch {
							// The process may have exited before the signal was delivered.
						}
					};
					this.stopChild = () => {
						signal("SIGTERM");
						killTimer ??= setTimeout(() => signal("SIGKILL"), 1500);
					};
					const timeout = setTimeout(
						() => {
							timedOut = true;
							append(`\nTest Studio: job exceeded its ${this.timeoutMs} ms limit.\n`);
							this.stopChild?.();
						},
						Math.max(1, this.timeoutMs - (Date.now() - job.startedAt!)),
					);
					// A stop may arrive while realpath is awaiting.
					if (cancelled()) this.stopChild();
					try {
						const exitCode = await new Promise<number | null>((resolve, reject) => {
							child.once("error", reject);
							child.once("close", (code) => resolve(code));
						});
						if (index === 0) job.exitCode = exitCode;
						else if (exitCode !== 0 && !cancelled() && !timedOut)
							throw new Error(
								"Unable to collect the test report. See process output.",
							);
					} finally {
						clearTimeout(timeout);
						if (killTimer) {
							clearTimeout(killTimer);
							signal("SIGKILL");
						}
						this.child = undefined;
						this.stopChild = undefined;
						if (index === 0 && formatter) append(formatter.end());
					}
				}
				try {
					job.results = adapter.parseResults
						? await adapter.parseResults({
								file: job.file,
								reportPath: report,
								output: job.output,
								exitCode: job.exitCode ?? null,
							})
						: parseReport(await readFile(report, "utf8"));
					if (
						!Array.isArray(job.results) ||
						job.results.some(
							(result) =>
								!result ||
								typeof result.name !== "string" ||
								!["passed", "failed", "skipped"].includes(result.status) ||
								!Number.isFinite(result.duration) ||
								result.duration < 0,
						)
					) {
						job.results = [];
						throw new Error("Adapter returned invalid results");
					}
				} catch (cause) {
					const error = cause as NodeJS.ErrnoException;
					append(
						`\nTest Studio: no readable test results (${error.code ?? error.message}). See process output.\n`,
					);
				}
				job.status = cancelled()
					? "cancelled"
					: !timedOut &&
						  job.exitCode === 0 &&
						  job.results.length > 0 &&
						  !job.results.some((result) => result.status === "failed")
						? "passed"
						: "failed";
				if (job.exitCode === 0 && !job.results.length)
					append(
						"\nTest Studio: no test results were produced; this is not counted as a pass.\n",
					);
				if (
					!cancelled() &&
					job.selection.caseIds?.length &&
					!job.results.some((result) => result.status !== "skipped")
				) {
					job.status = "failed";
					append(
						"\nTest Studio: the selected tests did not run. Their names may have changed or they were skipped at runtime.\n",
					);
				}
			} catch (cause) {
				const error = cause as NodeJS.ErrnoException;
				append(`\n${error.message}\n`);
				job.status = cancelled() ? "cancelled" : "failed";
			}
			job.finishedAt = Date.now();
			this.onEvent?.({ type: "job-finished", job });
		}
		if (!cancelled())
			run.status = run.jobs.some((job) => job.status === "failed") ? "failed" : "passed";
		run.finishedAt = Date.now();
		this.current = undefined;
	}
}

function validateCommand(command: Command) {
	if (command?.collectReport) validateCommand(command.collectReport);
	if (
		!command ||
		typeof command.executable !== "string" ||
		!command.executable ||
		command.executable.includes("\0") ||
		typeof command.cwd !== "string" ||
		!command.cwd ||
		!Array.isArray(command.args) ||
		command.args.some((arg) => typeof arg !== "string" || arg.includes("\0"))
	)
		throw new Error("Adapter returned an invalid command.");
	if (
		command.env &&
		Object.entries(command.env).some(
			([key, value]) =>
				!key || /[=\0]/.test(key) || typeof value !== "string" || value.includes("\0"),
		)
	)
		throw new Error("Adapter returned an invalid environment.");
}

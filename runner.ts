import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { adapters, displayCommand, parseReport } from "./adapters.ts";
import type { Catalog, Job, Run, RunOptions, Selection } from "./types.ts";
export function validateRequest(value: any): {
    selections: Selection[];
    options: RunOptions;
} {
    if (!value || !Array.isArray(value.selections) || !value.selections.length || value.selections.length > 500)
        throw new Error("Select between 1 and 500 files.");
    const seen = new Set();
    for (const selection of value.selections) {
        if (!selection || typeof selection.fileId !== "string" || seen.has(selection.fileId))
            throw new Error("Invalid or duplicate file selection.");
        seen.add(selection.fileId);
        if (selection.caseIds !== undefined && (!Array.isArray(selection.caseIds) || selection.caseIds.length > 5000 || selection.caseIds.some((id: unknown) => typeof id !== "string")))
            throw new Error("Invalid test selection.");
    }
    const options = value.options ?? {};
    if (typeof options !== "object" || Array.isArray(options))
        throw new Error("Invalid run options.");
    if (options.device !== undefined && (typeof options.device !== "string" || options.device.length > 250 || /[\r\n\0]/.test(options.device)))
        throw new Error("Invalid device identifier.");
    if (options.env !== undefined && (!options.env || typeof options.env !== "object" || Array.isArray(options.env) || Object.keys(options.env).length > 50))
        throw new Error("Invalid flow environment.");
    for (const [key, value] of Object.entries(options.env ?? {})) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string" || value.length > 4096 || value.includes("\0"))
            throw new Error("Flow environment must use NAME=value entries.");
    }
    return { selections: value.selections, options: { device: options.device, env: options.env } };
}
export class TestRunner {
    runs: Run[] = [];
    private child?: ChildProcess;
    private current?: Run;
    private stopChild?: () => void;
    constructor(private timeoutMs = 30 * 60000) { }
    async start(catalog: Catalog, selections: Selection[], options: RunOptions = {}): Promise<Run> {
        if (this.current)
            throw new Error("A run is already active. Stop it or wait for it to finish.");
        const files = selections.map(selection => {
            const file = catalog.files.find(file => file.id === selection.fileId);
            if (!file)
                throw new Error("A selected file is no longer in the catalog. Refresh discovery.");
            if (!adapters.some(adapter => adapter.id === file.runner))
                throw new Error(`${file.runner} is detected but has no execution adapter yet.`);
            if (!catalog.runners.find(runner => runner.id === file.runner)?.available)
                throw new Error(`${file.runner} is not on PATH. Install it and restart Test Studio.`);
            // Validate the entire request before launching any process.
            adapters.find(adapter => adapter.id === file.runner)!.command(catalog.root, file, selection, "/tmp/report.xml", options);
            return file;
        });
        // Reserve synchronously to prevent simultaneous requests launching overlapping runs.
        const run: Run = { id: crypto.randomUUID(), status: "queued", startedAt: Date.now(), jobs: [], artifactDir: "" };
        this.current = run;
        try {
            run.artifactDir = await mkdtemp(join(tmpdir(), "test-studio-"));
            run.jobs = files.map((file, index) => ({ id: String(index), file, selection: selections[index], status: "queued", command: "", output: "", results: [] }));
            this.runs.unshift(run);
            const stale = this.runs.splice(20);
            for (const item of stale)
                void rm(item.artifactDir, { recursive: true, force: true }).catch(() => { });
            void this.execute(catalog.root, run, options);
            return run;
        }
        catch (error) {
            this.current = undefined;
            throw error;
        }
    }
    stop(id: string) {
        if (!this.current || this.current.id !== id)
            throw new Error("This run is no longer active.");
        this.current.status = "cancelled";
        for (const job of this.current.jobs)
            if (job.status === "queued")
                job.status = "cancelled";
        this.stopChild?.();
    }
    shutdown() { if (this.current)
        this.stop(this.current.id); }
    private async execute(root: string, run: Run, options: RunOptions) {
        const cancelled = () => run.status === "cancelled";
        run.status = "running";
        for (const job of run.jobs) {
            if (cancelled())
                break;
            job.status = "running";
            job.startedAt = Date.now();
            try {
                const actual = await realpath(resolve(root, job.file.path));
                const inside = relative(root, actual);
                if (inside === ".." || inside.startsWith(`..${sep}`))
                    throw new Error("Test file resolves outside the project.");
                if (cancelled()) {
                    job.status = "cancelled";
                    job.finishedAt = Date.now();
                    break;
                }
                const report = join(run.artifactDir, `${job.id}.xml`);
                const command = adapters.find(adapter => adapter.id === job.file.runner)!.command(root, job.file, job.selection, report, options);
                job.command = displayCommand(command);
                // Never invoke a shell: paths, device IDs, and environment values are literal arguments.
                const child = spawn(command.executable, command.args, { cwd: command.cwd, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
                this.child = child;
                const append = (chunk: string) => {
                    job.output = (job.output + chunk.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")).slice(-100000);
                };
                child.stdout!.setEncoding("utf8").on("data", append);
                child.stderr!.setEncoding("utf8").on("data", append);
                let killTimer: ReturnType<typeof setTimeout> | undefined;
                const signal = (name: NodeJS.Signals) => {
                    try {
                        if (child.pid && process.platform !== "win32")
                            process.kill(-child.pid, name);
                        else
                            child.kill(name);
                    }
                    catch { }
                };
                this.stopChild = () => { signal("SIGTERM"); killTimer ??= setTimeout(() => signal("SIGKILL"), 1500); };
                let timedOut = false;
                const timeout = setTimeout(() => { timedOut = true; append("\nTest Studio: job exceeded its 30-minute limit.\n"); this.stopChild?.(); }, this.timeoutMs);
                // A stop may arrive while realpath is awaiting.
                if (cancelled())
                    this.stopChild();
                try {
                    job.exitCode = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", code => resolve(code)); });
                }
                finally {
                    clearTimeout(timeout);
                    if (killTimer) {
                        clearTimeout(killTimer);
                        signal("SIGKILL");
                    }
                    this.child = undefined;
                    this.stopChild = undefined;
                }
                try {
                    job.results = parseReport(await readFile(report, "utf8"));
                }
                catch (error: any) {
                    append(`\nTest Studio: no readable JUnit report (${error.code ?? error.message}). See process output.\n`);
                }
                job.status = cancelled() ? "cancelled" : !timedOut && job.exitCode === 0 && job.results.length > 0 && !job.results.some(result => result.status === "failed") ? "passed" : "failed";
                if (job.exitCode === 0 && !job.results.length)
                    append("\nTest Studio: no test results were produced; this is not counted as a pass.\n");
                if (!cancelled() && job.selection.caseIds?.length && !job.results.some(result => result.status !== "skipped")) {
                    job.status = "failed";
                    append("\nTest Studio: the selected tests did not run. Their names may have changed or they were skipped at runtime.\n");
                }
            }
            catch (error: any) {
                job.output += `\n${error.message}\n`;
                job.status = cancelled() ? "cancelled" : "failed";
            }
            job.finishedAt = Date.now();
        }
        if (!cancelled())
            run.status = run.jobs.some(job => job.status === "failed") ? "failed" : "passed";
        run.finishedAt = Date.now();
        this.current = undefined;
    }
}

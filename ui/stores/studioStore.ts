import { makeAutoObservable, observable, reaction, runInAction } from "mobx";
import type { Catalog, Run, Selection } from "../../types.ts";
import {
	defaultFilters,
	filterFiles,
	reconcileSelection,
	runOptions,
	selectionsFor,
	toggleCase,
	type RunSummary,
	type Selected,
} from "../model.ts";
import { poll } from "./poll.ts";

export type StudioRequest = <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;

export class StudioStore {
	catalog: Catalog | null = null;
	runs: RunSummary[] = [];
	connected = false;
	error = "";
	filters = { ...defaultFilters };
	fileId: string | null = null;
	selected: Selected = new Map();
	view: "file" | "history" | "run" = "file";
	runId: string | null = null;
	private runDetails: Run | null = null;
	jobId: string | null = null;
	tab: "tests" | "source" = "tests";
	device = "";
	variables = "";
	settingsOpen = false;
	starting = false;
	scanning = false;
	source: string | null = null;
	sourceError = "";
	private connection: AbortController | null = null;
	private disposePolling: (() => void) | null = null;
	private catalogVersion = 0;
	private runsVersion = 0;

	constructor(private readonly request: StudioRequest) {
		makeAutoObservable<
			this,
			| "request"
			| "connection"
			| "disposePolling"
			| "catalogVersion"
			| "runsVersion"
			| "runDetails"
		>(
			this,
			{
				catalog: observable.ref,
				runs: observable.ref,
				runDetails: observable.ref,
				selected: observable.ref,
				request: false,
				connection: false,
				disposePolling: false,
				catalogVersion: false,
				runsVersion: false,
			},
			{ autoBind: true },
		);
	}

	get files() {
		return filterFiles(this.catalog, this.filters);
	}

	get currentFile() {
		return this.catalog?.files.find((file) => file.id === this.fileId);
	}

	get workspaces() {
		return [...new Set(this.catalog?.files.map((file) => file.workspace))].sort();
	}

	get run() {
		return this.runDetails?.id === this.runId ? this.runDetails : null;
	}

	get busy() {
		return (
			this.starting ||
			this.runs.some((run) => !run.finishedAt) ||
			!!(this.view === "run" && this.run && !this.run.finishedAt)
		);
	}

	get notice() {
		return [this.error, ...(this.catalog?.warnings ?? [])].filter(Boolean).join("\n");
	}

	connect() {
		if (this.connection) return;
		this.connection = new AbortController();
		const stopCatalog = poll(this.refresh);
		let stopRun = () => {};
		let stopSource = () => {};
		const disposeRun = reaction(
			() => (this.view === "run" ? this.runId : null),
			(id) => {
				stopRun();
				stopRun = id ? poll((signal) => this.refreshRun(id, signal)) : () => {};
			},
			{ fireImmediately: true },
		);
		const disposeSource = reaction(
			() =>
				this.view === "file" && this.tab === "source" ? this.currentFile?.id : undefined,
			(id) => {
				stopSource();
				stopSource = this.loadSource(id);
			},
			{ fireImmediately: true },
		);
		this.disposePolling = () => {
			disposeRun();
			disposeSource();
			stopCatalog();
			stopRun();
			stopSource();
		};
	}

	disconnect() {
		this.connection?.abort();
		this.connection = null;
		this.disposePolling?.();
		this.disposePolling = null;
		this.connected = false;
		this.starting = false;
		this.scanning = false;
	}

	private async refresh(signal: AbortSignal) {
		const catalogVersion = this.catalogVersion;
		const runsVersion = this.runsVersion;
		try {
			const [catalog, runs] = await Promise.all([
				this.request<Catalog>("/api/catalog", undefined, signal),
				this.request<RunSummary[]>("/api/runs", undefined, signal),
			]);
			if (!signal.aborted)
				runInAction(() => {
					if (!this.scanning && catalogVersion === this.catalogVersion)
						this.applyCatalog(catalog);
					if (!this.starting && runsVersion === this.runsVersion) this.runs = runs;
					this.connected = true;
				});
		} catch {
			if (!signal.aborted)
				runInAction(() => {
					this.connected = false;
				});
		}
		return 1200;
	}

	private async refreshRun(id: string, signal: AbortSignal) {
		try {
			const run = await this.request<Run>(`/api/runs/${id}`, undefined, signal);
			if (!signal.aborted)
				runInAction(() => {
					this.runDetails = run;
				});
			return run.finishedAt ? null : 500;
		} catch (cause) {
			if (!signal.aborted) this.showError(cause);
			return 1200;
		}
	}

	private loadSource(id?: string) {
		this.source = null;
		this.sourceError = "";
		const controller = new AbortController();
		if (id) {
			void this.request<{ source: string }>(
				`/api/source?id=${encodeURIComponent(id)}`,
				undefined,
				controller.signal,
			)
				.then(({ source }) => {
					if (!controller.signal.aborted)
						runInAction(() => {
							this.source = source;
						});
				})
				.catch((cause: unknown) => {
					if (!controller.signal.aborted)
						runInAction(() => {
							this.sourceError =
								cause instanceof Error ? cause.message : String(cause);
						});
				});
		}
		return () => controller.abort();
	}

	private applyCatalog(catalog: Catalog) {
		this.catalog = catalog;
		this.selected = reconcileSelection(this.selected, catalog);
		if (!catalog.files.some((file) => file.id === this.fileId)) {
			this.fileId =
				catalog.files.find((file) =>
					catalog.runners.some((runner) => runner.id === file.runner),
				)?.id ??
				catalog.files[0]?.id ??
				null;
		}
	}

	private showError(cause: unknown) {
		this.error = cause instanceof Error ? cause.message : String(cause);
	}

	setQuery(query: string) {
		this.filters.query = query;
	}
	setPlatform(platform: string) {
		this.filters.platform = platform;
	}
	setWorkspace(workspace: string) {
		this.filters.workspace = workspace;
	}
	toggleWorkspace(workspace: string) {
		this.setWorkspace(this.filters.workspace === workspace ? "all" : workspace);
	}
	setRunner(runner: string) {
		this.filters.runner = runner;
		this.filters.workspace = "all";
	}
	setTab(tab: "tests" | "source") {
		this.tab = tab;
	}
	selectJob(id: string) {
		this.jobId = id;
	}
	setDevice(device: string) {
		this.device = device;
	}
	setVariables(variables: string) {
		this.variables = variables;
	}
	openSettings() {
		this.settingsOpen = true;
	}
	closeSettings() {
		this.settingsOpen = false;
	}
	showFiles() {
		this.view = "file";
	}
	showHistory() {
		this.view = "history";
	}
	openFile(id: string) {
		this.fileId = id;
		this.showFiles();
	}

	openRun(id: string) {
		this.runId = id;
		this.jobId = null;
		this.view = "run";
	}

	clearSelection() {
		this.selected = new Map();
	}

	selectVisible() {
		const next = new Map(this.selected);
		for (const file of this.files) {
			if (this.catalog?.runners.some((runner) => runner.id === file.runner))
				next.set(file.id, null);
		}
		this.selected = next;
	}

	selectFile(id: string, checked: boolean) {
		const next = new Map(this.selected);
		if (checked) next.set(id, null);
		else next.delete(id);
		this.selected = next;
	}

	selectCase(id: string, checked: boolean) {
		if (this.currentFile)
			this.selected = toggleCase(this.selected, this.currentFile, id, checked);
	}

	startSelected() {
		return this.start(selectionsFor(this.selected));
	}

	async start(selections: Selection[]) {
		const connection = this.connection;
		if (!connection || this.busy) return;
		this.starting = true;
		this.error = "";
		this.runsVersion++;
		try {
			const result = await this.request<{ id: string }>(
				"/api/run",
				{ selections, options: runOptions(this.device, this.variables) },
				connection.signal,
			);
			if (connection.signal.aborted) return;
			this.openRun(result.id);
			const runs = await this.request<RunSummary[]>(
				"/api/runs",
				undefined,
				connection.signal,
			);
			if (!connection.signal.aborted)
				runInAction(() => {
					this.runs = runs;
				});
		} catch (cause) {
			if (!connection.signal.aborted) this.showError(cause);
		} finally {
			if (!connection.signal.aborted)
				runInAction(() => {
					this.starting = false;
					this.runsVersion++;
				});
		}
	}

	async rescan() {
		const connection = this.connection;
		if (!connection || this.scanning) return;
		this.catalogVersion++;
		this.scanning = true;
		this.error = "";
		try {
			const catalog = await this.request<Catalog>("/api/scan", {}, connection.signal);
			if (!connection.signal.aborted) this.applyCatalog(catalog);
		} catch (cause) {
			if (!connection.signal.aborted) this.showError(cause);
		} finally {
			if (!connection.signal.aborted)
				runInAction(() => {
					this.catalogVersion++;
					this.scanning = false;
				});
		}
	}

	async stop() {
		const connection = this.connection;
		if (!connection || !this.runId) return;
		try {
			await this.request(`/api/runs/${this.runId}/stop`, {}, connection.signal);
		} catch (cause) {
			if (!connection.signal.aborted) this.showError(cause);
		}
	}
}

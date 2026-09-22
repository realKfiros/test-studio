import { useCallback, useEffect, useRef, useState } from "react";
import type { Catalog, Run, Selection } from "../types";
import { api } from "./api";
import { usePageTitle } from "./hooks/usePageTitle";
import {
	defaultFilters,
	filterFiles,
	reconcileSelection,
	runOptions,
	toggleCase,
	type RunSummary,
	type Selected,
} from "./model";

export function useStudio() {
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [runs, setRuns] = useState<RunSummary[]>([]);
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState("");
	const [filters, setFilters] = useState(defaultFilters);
	const [fileId, setFileId] = useState<string | null>(null);
	const [selected, setSelected] = useState<Selected>(new Map());
	const [view, setView] = useState<"file" | "history" | "run">("file");
	const [runId, setRunId] = useState<string | null>(null);
	const [run, setRun] = useState<Run | null>(null);
	const [jobId, setJobId] = useState<string | null>(null);
	const [tab, setTab] = useState<"tests" | "source">("tests");
	const [device, setDevice] = useState("");
	const [variables, setVariables] = useState("");
	const [starting, setStarting] = useState(false);
	const [scanning, setScanning] = useState(false);
	const startingRef = useRef(false);
	const requestVersion = useRef(0);
	const showError = useCallback(
		(cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
		[],
	);
	const applyCatalog = useCallback((next: Catalog) => {
		setCatalog(next);
		setSelected((previous) => reconcileSelection(previous, next));
		setFileId(
			(previous) =>
				previous ??
				next.files.find((file) => next.runners.some((runner) => runner.id === file.runner))
					?.id ??
				next.files[0]?.id ??
				null,
		);
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			const version = requestVersion.current;
			try {
				const [nextCatalog, nextRuns] = await Promise.all([
					api<Catalog>("/api/catalog", undefined, controller.signal),
					api<RunSummary[]>("/api/runs", undefined, controller.signal),
				]);
				if (!controller.signal.aborted) {
					if (version === requestVersion.current) applyCatalog(nextCatalog);
					setRuns(nextRuns);
					setConnected(true);
				}
			} catch {
				if (!controller.signal.aborted) setConnected(false);
			} finally {
				if (!controller.signal.aborted) timer = setTimeout(poll, 1200);
			}
		};
		void poll();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	}, [applyCatalog]);
	usePageTitle(catalog?.name);
	useEffect(() => {
		if (!runId || view !== "run") return;
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const value = await api<Run>(`/api/runs/${runId}`, undefined, controller.signal);
				if (!controller.signal.aborted) {
					setRun(value);
					if (!value.finishedAt) timer = setTimeout(poll, 500);
				}
			} catch (cause) {
				if (!controller.signal.aborted) {
					showError(cause);
					timer = setTimeout(poll, 1200);
				}
			}
		};
		void poll();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	}, [runId, view, showError]);
	const openRun = (id: string) => {
		setRunId(id);
		setJobId(null);
		setView("run");
	};
	const start = async (selections: Selection[]) => {
		if (startingRef.current) return;
		startingRef.current = true;
		setStarting(true);
		setError("");
		try {
			const result = await api<{ id: string }>("/api/run", {
				selections,
				options: runOptions(device, variables),
			});
			openRun(result.id);
			setRuns(await api<RunSummary[]>("/api/runs"));
		} catch (cause) {
			showError(cause);
		} finally {
			startingRef.current = false;
			setStarting(false);
		}
	};
	const rescan = async () => {
		requestVersion.current++;
		setScanning(true);
		setError("");
		try {
			applyCatalog(await api<Catalog>("/api/scan", {}));
		} catch (cause) {
			showError(cause);
		} finally {
			requestVersion.current++;
			setScanning(false);
		}
	};
	const stop = async () => {
		if (!runId) return;
		try {
			await api(`/api/runs/${runId}/stop`, {});
		} catch (cause) {
			showError(cause);
		}
	};
	const files = filterFiles(catalog, filters);
	const currentFile = catalog?.files.find((file) => file.id === fileId);
	return {
		catalog,
		runs,
		connected,
		error,
		setError,
		filters,
		setFilters,
		files,
		currentFile,
		selected,
		setSelected,
		view,
		setView,
		runId,
		run: run?.id === runId ? run : null,
		jobId,
		setJobId,
		tab,
		setTab,
		device,
		setDevice,
		variables,
		setVariables,
		scanning,
		busy:
			starting ||
			runs.some((run) => !run.finishedAt) ||
			(view === "run" && run?.id === runId && !run.finishedAt),
		openFile: (id: string) => {
			setFileId(id);
			setView("file");
		},
		openRun,
		start,
		stop,
		rescan,
		selectVisible: () =>
			setSelected((previous) => {
				const next = new Map(previous);
				for (const file of files)
					if (catalog?.runners.some((runner) => runner.id === file.runner))
						next.set(file.id, null);
				return next;
			}),
		selectFile: (id: string, checked: boolean) =>
			setSelected((previous) => {
				const next = new Map(previous);
				if (checked) next.set(id, null);
				else next.delete(id);
				return next;
			}),
		selectCase: (caseId: string, checked: boolean) => {
			if (currentFile)
				setSelected((previous) => toggleCase(previous, currentFile, caseId, checked));
		},
	};
}
export type Studio = ReturnType<typeof useStudio>;

import { afterEach, describe, expect, test } from "bun:test";
import { autorun } from "mobx";
import type { Catalog, Run, TestFile } from "../types.ts";
import { selectionsFor } from "../ui/model.ts";
import { StudioStore, type StudioRequest } from "../ui/stores/studioStore.ts";
import { poll } from "../ui/stores/poll.ts";

const files: TestFile[] = ["first", "second"].map((name) => ({
	id: `${name}.test.ts`,
	path: `${name}.test.ts`,
	name,
	runner: "bun",
	workspace: ".",
	cwd: ".",
	cases: ["one", "two"].map((id) => ({
		id,
		name: id,
		fullName: `${name} ${id}`,
		line: 1,
		mode: "normal",
		runnable: true,
	})),
}));
const catalog: Catalog = {
	root: "/project",
	name: "Example",
	scannedAt: "2026-09-22T00:00:00Z",
	files,
	libraries: ["bun"],
	warnings: [],
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
function completedRun(id: string): Run {
	return { id, status: "passed", startedAt: 1, finishedAt: 2, jobs: [], artifactDir: "/reports" };
}
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
});
async function flush() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}
function harness() {
	type Request = {
		path: string;
		body?: unknown;
		signal?: AbortSignal;
		resolve: (value: unknown) => void;
		reject: (cause: unknown) => void;
	};
	const requests: Request[] = [];
	const pending: Request[] = [];
	const request: StudioRequest = <T>(path: string, body?: unknown, signal?: AbortSignal) =>
		new Promise<T>((resolve, reject) => {
			const item = {
				path,
				body,
				signal,
				resolve: (value: unknown) => resolve(value as T),
				reject,
			};
			requests.push(item);
			pending.push(item);
		});
	const store = new StudioStore(request);
	cleanup.push(store.disconnect);
	const take = (path: string) => {
		const index = pending.findIndex((item) => item.path === path);
		if (index < 0) throw new Error(`No pending request: ${path}`);
		return pending.splice(index, 1)[0];
	};
	const connect = async () => {
		store.connect();
		take("/api/catalog").resolve(catalog);
		take("/api/runs").resolve([]);
		await flush();
	};
	return { store, requests, take, connect };
}

describe("StudioStore", () => {
	test("bound actions update computed filters and partial selections reactively", async () => {
		const { store, connect } = harness();
		await connect();
		const changes: unknown[] = [];
		cleanup.push(
			autorun(() =>
				changes.push({
					files: store.files.map((file) => file.id),
					selections: selectionsFor(store.selected),
				}),
			),
		);
		const setQuery = store.setQuery;
		setQuery("first");
		store.selectVisible();
		store.selectCase("one", false);
		expect(changes.at(-1)).toEqual({
			files: [files[0].id],
			selections: [{ fileId: files[0].id, caseIds: ["two"] }],
		});
		expect(changes.length).toBe(4);
		store.clearSelection();
		expect(store.selected.size).toBe(0);
	});

	test("a late discovery poll cannot replace a manual rescan or restore removed selections", async () => {
		const { store, take } = harness();
		store.connect();
		const oldCatalog = take("/api/catalog");
		const oldRuns = take("/api/runs");
		store.selectFile(files[0].id, true);
		const scanning = store.rescan();
		take("/api/scan").resolve({ ...catalog, name: "Rescanned", files: [files[1]] });
		await scanning;
		oldCatalog.resolve(catalog);
		oldRuns.resolve([]);
		await flush();
		expect(store.catalog?.name).toBe("Rescanned");
		expect(store.currentFile?.id).toBe(files[1].id);
		expect(store.selected.size).toBe(0);
		expect(store.scanning).toBe(false);
	});

	test("switching runs aborts old requests and ignores their late results", async () => {
		const { store, take, connect } = harness();
		await connect();
		store.openRun("old");
		const old = take("/api/runs/old");
		store.openRun("new");
		expect(old.signal?.aborted).toBe(true);
		take("/api/runs/new").resolve(completedRun("new"));
		await flush();
		old.resolve(completedRun("old"));
		await flush();
		expect(store.run?.id).toBe("new");
	});

	test("source loading follows the selected file and clears when leaving source view", async () => {
		const { store, take, connect } = harness();
		await connect();
		store.setTab("source");
		const old = take(`/api/source?id=${files[0].id}`);
		store.openFile(files[1].id);
		expect(old.signal?.aborted).toBe(true);
		take(`/api/source?id=${files[1].id}`).resolve({ source: "new source" });
		await flush();
		old.resolve({ source: "old source" });
		await flush();
		expect(store.source).toBe("new source");
		store.showHistory();
		expect(store.source).toBeNull();
	});

	test("one start request preserves selected cases and settings, and stop targets that run", async () => {
		const { store, take, requests, connect } = harness();
		await connect();
		store.selectFile(files[0].id, true);
		store.selectCase("one", false);
		store.setDevice(" device ");
		store.setVariables("TOKEN=a=b");
		const starting = store.startSelected();
		await store.startSelected();
		expect(requests.filter((item) => item.path === "/api/run")).toHaveLength(1);
		expect(store.busy).toBe(true);
		const request = take("/api/run");
		expect(request.body).toEqual({
			selections: [{ fileId: files[0].id, caseIds: ["two"] }],
			options: { device: "device", env: { TOKEN: "a=b" } },
		});
		request.resolve({ id: "started" });
		await flush();
		take("/api/runs/started").resolve({
			...completedRun("started"),
			status: "running",
			finishedAt: undefined,
		});
		take("/api/runs").resolve([
			{ ...completedRun("started"), status: "running", finishedAt: undefined },
		]);
		await starting;
		const stopping = store.stop();
		take("/api/runs/started/stop").resolve({});
		await stopping;
		expect(store.view).toBe("run");
		expect(store.starting).toBe(false);
	});

	test("invalid settings and failed requests reset busy flags and show an error", async () => {
		const { store, connect, requests, take } = harness();
		await connect();
		store.setVariables("not a variable");
		await store.start([{ fileId: files[0].id }]);
		expect(requests.filter((item) => item.path === "/api/run")).toHaveLength(0);
		expect(store.error).toContain("NAME=value");
		expect(store.busy).toBe(false);
		const scanning = store.rescan();
		take("/api/scan").reject(new Error("Scan failed"));
		await scanning;
		expect(store.scanning).toBe(false);
		expect(store.error).toBe("Scan failed");
	});

	test("disconnect aborts requests and reactions, ignores late updates, and supports reconnect", async () => {
		const { store, take, requests } = harness();
		store.connect();
		store.connect();
		expect(requests).toHaveLength(2);
		const oldCatalog = take("/api/catalog");
		const oldRuns = take("/api/runs");
		const scanning = store.rescan();
		const scan = take("/api/scan");
		store.disconnect();
		expect([oldCatalog, oldRuns, scan].every((item) => item.signal?.aborted)).toBe(true);
		oldCatalog.resolve(catalog);
		oldRuns.resolve([]);
		scan.resolve(catalog);
		await scanning;
		await flush();
		expect(store.catalog).toBeNull();
		store.openRun("later");
		expect(requests).toHaveLength(3);
		store.connect();
		take("/api/catalog").resolve(catalog);
		take("/api/runs").resolve([]);
		take("/api/runs/later").resolve(completedRun("later"));
		await flush();
		expect(store.connected).toBe(true);
		expect(store.run?.id).toBe("later");
	});
});

test("disposing a poll prevents a late response from scheduling another request", async () => {
	let complete!: (delay: number) => void;
	let calls = 0;
	const dispose = poll(async () => {
		calls++;
		return new Promise<number>((resolve) => {
			complete = resolve;
		});
	});
	cleanup.push(dispose);
	dispose();
	complete(1);
	await new Promise((resolve) => setTimeout(resolve, 15));
	expect(calls).toBe(1);
});

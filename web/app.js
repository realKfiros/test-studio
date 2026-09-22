const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
	String(value ?? "").replace(
		/[&<>"']/g,
		(char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
	);
const state = {
	catalog: null,
	runner: "all",
	workspace: "all",
	query: "",
	platform: "all",
	file: null,
	tab: "tests",
	selected: new Map(),
	runs: [],
	runId: null,
	run: null,
	jobId: null,
	showHistory: false,
};
const runnerInfo = (id) => state.catalog?.runners.find((runner) => runner.id === id);
const supported = (file) => !!runnerInfo(file.runner);
const selectable = (file) => !!runnerInfo(file.runner)?.supportsIndividualTests;
const token = $('meta[name="test-studio-token"]').content;
let polling = false;
let sourceRequest = 0;
const duration = (ms) =>
	ms < 1000
		? `${Math.round(ms)}ms`
		: ms < 60000
			? `${(ms / 1000).toFixed(1)}s`
			: `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
async function api(path, body) {
	const response = await fetch(path, {
		method: body === undefined ? "GET" : "POST",
		headers: {
			"x-test-studio-token": token,
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const result = await response.json();
	if (!response.ok) throw new Error(result.error || "Request failed");
	return result;
}
function notice(message) {
	$("#notice").textContent = message;
	$("#notice").hidden = !message;
}
const showError = (error) => notice(error.message);
function filtered() {
	if (!state.catalog) return [];
	return state.catalog.files.filter(
		(file) =>
			(state.runner === "all" || file.runner === state.runner) &&
			(state.workspace === "all" || file.workspace === state.workspace) &&
			(state.platform === "all" || file.platform === state.platform) &&
			(!state.query ||
				[
					file.path,
					file.name,
					...file.cases.map((test) => test.fullName),
					...(file.tags ?? []),
				]
					.join(" ")
					.toLowerCase()
					.includes(state.query)),
	);
}
function summary() {
	const c = state.catalog;
	$("#project-name").textContent = c.name;
	$("#project-name").title = c.root;
	const stats = [
		["▤", c.files.length, "test files", "Auto-discovered"],
		["⌘", c.files.reduce((n, f) => n + f.cases.length, 0), "test declarations", "From source"],
		[
			"◈",
			c.runners.length,
			"active adapters",
			`${c.runners.filter((runner) => runner.available).length} tools available`,
		],
	];
	$("#stats").innerHTML = stats
		.map(
			([icon, count, label, note]) =>
				`<div class="stat"><span class="stat-icon">${icon}</span><div><div class="stat-value">${count.toLocaleString()}</div><div class="stat-label">${label}</div></div><span class="stat-note">${note}</span></div>`,
		)
		.join("");
	$("#libraries").textContent = `Detected: ${c.libraries.join(" · ") || "none yet"}`;
	$("#scan-time").textContent =
		`Scanned ${new Date(c.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
	$("#runners").innerHTML = [
		["all", "▦", "All tests"],
		...[
			...new Set([
				...c.runners.map((runner) => runner.id),
				...c.files.map((file) => file.runner),
			]),
		].map((id) => [id, "◉", runnerInfo(id)?.label ?? id]),
	]
		.map(
			([id, icon, label]) =>
				`<button data-runner="${esc(id)}" aria-label="${esc(label)}" title="${esc(label)}" class="${state.runner === id ? "active" : ""}"><span class="nav-icon">${icon}</span><span class="nav-text">${esc(label)}</span><span class="count">${c.files.filter((f) => id === "all" || f.runner === id).length}</span></button>`,
		)
		.join("");
	const workspaces = [...new Set(c.files.map((f) => f.workspace))].sort();
	if (document.activeElement !== $("#workspace-picker")) {
		$("#workspace-picker").innerHTML =
			'<option value="all">All workspaces</option>' +
			workspaces
				.map(
					(workspace) =>
						`<option value="${esc(workspace)}">${esc(workspace === "." ? "Project root" : workspace)}</option>`,
				)
				.join("");
		$("#workspace-picker").value = state.workspace;
	}
	$("#workspaces").innerHTML = workspaces
		.map(
			(workspace) =>
				`<button class="workspace-item ${state.workspace === workspace ? "active" : ""}" data-workspace="${esc(workspace)}" title="${esc(workspace)}"><span class="nav-icon">⌑</span><span class="nav-text">${esc(workspace === "." ? "Project root" : workspace)}</span><span class="count">${c.files.filter((f) => f.workspace === workspace).length}</span></button>`,
		)
		.join("");
	$("#breadcrumb").textContent =
		state.workspace !== "all"
			? state.workspace
			: state.runner === "all"
				? "All tests"
				: (runnerInfo(state.runner)?.label ?? state.runner);
}
function renderFiles() {
	const files = filtered();
	const scroll = $("#files").scrollTop;
	let workspace = null;
	$("#visible-count").textContent = `${files.length} files`;
	$("#files").innerHTML =
		files
			.map((file) => {
				const heading =
					workspace !== file.workspace
						? `<div class="workspace-heading"><span>⌄</span>${esc(file.workspace === "." ? "Project root" : file.workspace)}<span>${files.filter((f) => f.workspace === file.workspace).length}</span></div>`
						: "";
				workspace = file.workspace;
				const count = file.steps ? `${file.steps?.length ?? 0}` : file.cases.length;
				return `${heading}<div class="file-row ${state.file?.id === file.id ? "active" : ""}" role="listitem"><input type="checkbox" data-file-check="${esc(file.id)}" aria-label="Select ${esc(file.name)}" ${state.selected.has(file.id) ? "checked" : ""} ${supported(file) ? "" : "disabled"}><button class="file-open" data-file="${esc(file.id)}" title="${esc(file.path)}"><span class="file-icon ${esc(file.runner)}">${esc((runnerInfo(file.runner)?.label ?? file.runner).slice(0, 2).toUpperCase())}</span><span class="file-info"><span class="file-title">${esc(file.name)}</span><span class="file-path">${esc(file.path.slice(file.workspace === "." ? 0 : file.workspace.length + 1))}</span></span><span class="file-meta">${count}</span></button></div>`;
			})
			.join("") || '<div class="small-empty">No tests match these filters.</div>';
	document.querySelectorAll("[data-file-check]").forEach((input) => {
		input.indeterminate = state.selected.get(input.dataset.fileCheck) instanceof Set;
	});
	$("#files").scrollTop = scroll;
	selectionCount();
}
function selectionCount() {
	$("#selected-count").textContent = state.selected.size;
	$("#run-selected").disabled = !state.selected.size || state.runs.some((run) => !run.finishedAt);
	$("#run-selected").title =
		`${state.selected.size} files selected; individual test filters are preserved`;
}
function currentFile() {
	return state.catalog?.files.find((file) => file.id === state.file?.id);
}
function renderInspector() {
	if (state.runId) {
		renderRun();
		return;
	}
	if (state.showHistory) {
		renderRunHistory();
		return;
	}
	const file = currentFile();
	if (!file) {
		$("#inspector").innerHTML =
			'<div class="empty-state"><span class="empty-symbol">⌕</span><h2>Your next green check starts here</h2><p>Choose a file to inspect its tests, browse the source, or start a run.</p></div>';
		return;
	}
	const available = state.catalog.runners.find((r) => r.id === file.runner)?.available;
	$("#inspector").innerHTML =
		`<div class="inspector-heading"><div class="file-overline"><span class="badge ${esc(file.runner)}">${esc(file.runner.toUpperCase())}</span>${file.platform ? `<span class="badge">${esc(file.platform)}</span>` : ""}<span>${file.steps ? `${file.steps.length} steps` : `${file.cases.length} declarations`}</span></div><div class="inspector-title"><h2>${esc(file.name)}</h2><button class="run-file" data-run-file="${esc(file.id)}" ${supported(file) && available ? "" : "disabled"}>▶ Run ${file.steps ? "flow" : "file"}</button></div><div class="inspector-path">${esc(file.path)}</div></div><div class="tabs"><button class="tab ${state.tab === "tests" ? "active" : ""}" data-tab="tests">${file.steps ? "Flow steps" : "Tests"}</button><button class="tab ${state.tab === "source" ? "active" : ""}" data-tab="source">Source</button></div><div class="inspector-content" id="file-content"></div>`;
	if (state.tab === "source") {
		renderSource(file);
		return;
	}
	let content = file.note ? `<p class="note">${esc(file.note)}</p>` : "";
	if (!supported(file))
		content += `<p class="note">${esc(file.runner)} was detected. Enable an adapter for this framework in your Test Studio config.</p>`;
	else if (!available)
		content += `<p class="note">${esc(runnerInfo(file.runner)?.executable ?? file.runner)} is unavailable. Install it in your project or add it to PATH.</p>`;
	if (file.steps) {
		content += `<p class="note">${file.appId ? `App: ${esc(file.appId)}` : "Flow"}${file.tags?.length ? ` · Tags: ${esc(file.tags.join(", "))}` : ""}<br>Runs the complete flow. Start any required devices, apps, and services first.</p>`;
		content += file.steps
			.map(
				(step, index) =>
					`<div class="test-row"><span class="step-number">${String(index + 1).padStart(2, "0")}</span><span class="test-name">${esc(step.name)}</span><span class="test-line">:${step.line}</span></div>`,
			)
			.join("");
	} else {
		let suite = null;
		content += file.cases
			.map((test) => {
				const group =
					test.fullName.slice(0, -test.name.length).trim() || "File-level tests";
				const heading =
					suite !== group
						? `<div class="suite-name"><span>⌄</span> ${esc(group)}</div>`
						: "";
				suite = group;
				const selected =
					state.selected.has(file.id) &&
					(state.selected.get(file.id) === null ||
						state.selected.get(file.id)?.has(test.id));
				return `${heading}<div class="test-row"><input type="checkbox" data-case-check="${esc(test.id)}" aria-label="Select test ${esc(test.fullName)}" ${selected ? "checked" : ""} ${test.runnable && selectable(file) ? "" : "disabled"}><span class="test-name">${esc(test.name)}</span>${test.mode !== "normal" ? `<span class="badge">${esc(test.mode)}</span>` : ""}<span class="test-line">:${test.line}</span><button class="test-play" data-run-case="${esc(test.id)}" aria-label="Run test ${esc(test.fullName)}" ${test.runnable && selectable(file) && available ? "" : "disabled"}>▷</button></div>`;
			})
			.join("");
		if (!file.cases.length)
			content +=
				'<p class="note">No static test declarations found. A file-level run discovers tests generated at runtime.</p>';
	}
	$("#file-content").innerHTML = content;
}
async function renderSource(file) {
	const request = ++sourceRequest;
	$("#file-content").innerHTML = '<span class="source-loading">Loading source…</span>';
	try {
		const result = await api(`/api/source?id=${encodeURIComponent(file.id)}`);
		if (
			request !== sourceRequest ||
			state.runId ||
			state.tab !== "source" ||
			state.file?.id !== file.id
		)
			return;
		$("#file-content").innerHTML = `<pre class="source">${result.source
			.split("\n")
			.map(
				(line, index) =>
					`<span class="source-line"><span class="source-number">${index + 1}</span>${esc(line)}</span>`,
			)
			.join("")}</pre>`;
	} catch (error) {
		showError(error);
	}
}
function selectFile(id) {
	state.file = state.catalog.files.find((file) => file.id === id);
	state.runId = null;
	state.run = null;
	state.showHistory = false;
	renderFiles();
	renderInspector();
	renderHistory();
}
function renderRunHistory() {
	$("#inspector").innerHTML =
		`<div class="inspector-heading"><button class="back-button" id="back-to-file">← Back to explorer</button><div class="inspector-title"><h2>Recent runs</h2></div><p class="inspector-path">The last 20 runs in this server session.</p></div><div class="inspector-content">${state.runs.map((run) => `<button class="job-button history-entry" data-run="${run.id}"><span class="badge ${run.status}">${run.status}</span><span class="job-name">${run.jobs.length === 1 ? esc(run.jobs[0].file.name) : `${run.jobs.length} files`}</span><span>${new Date(run.startedAt).toLocaleTimeString()}</span></button>`).join("") || '<p class="note">No runs yet. Select a file or test to get started.</p>'}</div>`;
}
function renderHistory() {
	$("#history-count").textContent = state.runs.length;
	$("#history").innerHTML =
		state.runs
			.map(
				(run) =>
					`<button data-run="${run.id}" class="${run.id === state.runId ? "active" : ""}"><span class="history-status ${run.status}"></span><span class="nav-text">${run.jobs.length === 1 ? esc(run.jobs[0].file.name) : `${run.jobs.length} files`}</span><span class="count">${new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></button>`,
			)
			.join("") || '<p class="sidebar-empty">Your runs will appear here.</p>';
}
function renderRun() {
	const run = state.run;
	if (!run || run.id !== state.runId) {
		$("#inspector").innerHTML = '<div class="empty-state"><p>Loading run…</p></div>';
		return;
	}
	const job =
		run.jobs.find((job) => job.id === state.jobId) ??
		run.jobs.find((job) => job.status === "running") ??
		run.jobs[0];
	if (!job) return;
	const oldOutput = $("#output");
	const scroll = oldOutput?.scrollTop ?? 0;
	const follow = !oldOutput || oldOutput.scrollHeight - oldOutput.clientHeight - scroll < 50;
	const allResults = run.jobs.flatMap((job) => job.results);
	const counts = (status) => allResults.filter((result) => result.status === status).length;
	const completed = run.jobs.filter((job) => !["queued", "running"].includes(job.status)).length;
	const active = !run.finishedAt;
	$("#inspector").innerHTML =
		`<div class="inspector-heading run-heading"><button class="back-button" id="back-to-file">← Back to explorer</button><div class="file-overline"><span class="badge ${run.status}">${run.status.toUpperCase()}</span><span>${new Date(run.startedAt).toLocaleTimeString()}</span>${active ? '<span class="live-label">● LIVE</span>' : ""}</div><div class="inspector-title"><h2>${run.jobs.length === 1 ? esc(run.jobs[0].file.name) : `${run.jobs.length} files in this run`}</h2><div class="run-actions">${active ? '<button class="run-file stop-button" id="stop-run">■ Stop</button>' : `<button class="run-file" id="rerun">↻ Rerun</button>${run.jobs.some((job) => job.status === "failed") ? '<button class="run-file" id="rerun-failed">Rerun failed</button>' : ""}`}</div></div></div><div class="progress-track"><div class="progress-fill ${run.status}" id="progress"></div></div><div class="run-summary"><span class="passed">✓ ${counts("passed")} passed</span><span class="failed">${counts("failed")} failed</span><span>${counts("skipped")} skipped</span><span>${completed}/${run.jobs.length} files</span>${run.jobs.some((job) => job.status === "failed") ? `<span class="failed">${run.jobs.filter((job) => job.status === "failed").length} files failed</span>` : ""}<span>${duration((run.finishedAt ?? Date.now()) - run.startedAt)}</span></div><div class="job-list">${run.jobs.map((item) => `<button class="job-button ${item.id === job.id ? "active" : ""}" data-job="${item.id}"><span class="job-status ${item.status}">${item.status}</span><span class="job-name">${esc(item.file.path)}</span><span>${item.finishedAt ? duration(item.finishedAt - item.startedAt) : ""}</span></button>`).join("")}</div><div class="command-bar">${esc(job.command || "Waiting in queue…")}<br>cwd: ${esc(job.file.cwd)}</div><pre class="run-output" id="output"></pre>${job.results.length ? `<div class="run-results">${job.results.map((result) => `<div class="result-row ${result.status}"><span>${result.status === "passed" ? "✓" : result.status === "failed" ? "×" : "−"}</span><span>${esc(result.name)}</span><span class="duration">${duration(result.duration)}</span></div>${result.message ? `<pre class="result-message">${esc(result.message)}</pre>` : ""}`).join("")}</div>` : ""}<div class="run-meta"><span class="artifact-path" title="${esc(run.artifactDir)}">Reports: ${esc(run.artifactDir)}</span><span>${job.exitCode !== undefined ? `Exit ${job.exitCode ?? "signal"}` : ""}</span></div>`;
	$("#progress").style.width = `${(completed / run.jobs.length) * 100}%`;
	$("#output").textContent =
		job.output ||
		(job.status === "queued"
			? "Waiting for the previous file to finish…"
			: "Waiting for runner output…");
	$("#output").scrollTop = follow ? $("#output").scrollHeight : scroll;
}
function options() {
	const env = {};
	for (const line of $("#env").value.split("\n")) {
		if (!line.trim()) continue;
		const index = line.indexOf("=");
		if (index < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(line.slice(0, index).trim()))
			throw new Error("Flow variables must use NAME=value, one per line.");
		env[line.slice(0, index).trim()] = line.slice(index + 1);
	}
	return { device: $("#device").value.trim() || undefined, env };
}
async function start(selections) {
	try {
		notice("");
		$("#run-selected").disabled = true;
		const run = await api("/api/run", { selections, options: options() });
		state.runId = run.id;
		state.jobId = null;
		state.run = await api(`/api/runs/${run.id}`);
		state.runs = await api("/api/runs");
		renderHistory();
		renderRun();
		selectionCount();
	} catch (error) {
		showError(error);
		selectionCount();
	}
}
function applyCatalog(catalog) {
	const changed =
		!state.catalog ||
		JSON.stringify(catalog.files) !== JSON.stringify(state.catalog.files) ||
		JSON.stringify(catalog.runners) !== JSON.stringify(state.catalog.runners);
	state.catalog = catalog;
	for (const [id, cases] of state.selected) {
		const file = catalog.files.find((file) => file.id === id);
		if (!file) state.selected.delete(id);
		else if (cases) {
			for (const caseId of cases)
				if (!file.cases.some((test) => test.id === caseId && test.runnable))
					cases.delete(caseId);
			if (!cases.size) state.selected.delete(id);
		}
	}
	if (!state.file) state.file = catalog.files.find((file) => supported(file)) ?? catalog.files[0];
	summary();
	if (changed) {
		renderFiles();
		if (!state.runId) renderInspector();
	}
	if (catalog.warnings.length) notice(catalog.warnings.join("\n"));
}
document.addEventListener("click", async (event) => {
	const button = event.target.closest("button");
	if (!button || button.disabled) return;
	try {
		if (button.dataset.runner) {
			state.runner = button.dataset.runner;
			state.workspace = "all";
			summary();
			renderFiles();
		} else if (button.dataset.workspace) {
			state.workspace =
				state.workspace === button.dataset.workspace ? "all" : button.dataset.workspace;
			summary();
			renderFiles();
		} else if (button.dataset.file) selectFile(button.dataset.file);
		else if (button.dataset.tab) {
			state.tab = button.dataset.tab;
			renderInspector();
		} else if (button.dataset.runFile) await start([{ fileId: button.dataset.runFile }]);
		else if (button.dataset.runCase)
			await start([{ fileId: state.file.id, caseIds: [button.dataset.runCase] }]);
		else if (button.dataset.run) {
			state.runId = button.dataset.run;
			state.jobId = null;
			state.run = await api(`/api/runs/${state.runId}`);
			renderHistory();
			renderRun();
		} else if (button.dataset.job) {
			state.jobId = button.dataset.job;
			renderRun();
		} else if (button.id === "run-selected")
			await start(
				[...state.selected].map(([fileId, cases]) => ({
					fileId,
					...(cases ? { caseIds: [...cases] } : {}),
				})),
			);
		else if (button.id === "select-visible") {
			for (const file of filtered()) if (supported(file)) state.selected.set(file.id, null);
			renderFiles();
			if (!state.runId) renderInspector();
		} else if (button.id === "clear") {
			state.selected.clear();
			renderFiles();
			if (!state.runId) renderInspector();
		} else if (button.id === "refresh") {
			button.disabled = true;
			applyCatalog(await api("/api/scan", {}));
			button.disabled = false;
		} else if (button.id === "settings-button") $("#settings").showModal();
		else if (button.id === "history-button") {
			state.runId = null;
			state.showHistory = true;
			renderInspector();
			renderHistory();
		} else if (button.id === "back-to-file") {
			state.runId = null;
			state.showHistory = false;
			renderInspector();
			renderHistory();
		} else if (button.id === "stop-run") {
			await api(`/api/runs/${state.runId}/stop`, {});
			state.run = await api(`/api/runs/${state.runId}`);
			renderRun();
		} else if (button.id === "rerun" || button.id === "rerun-failed")
			await start(
				state.run.jobs
					.filter((job) => button.id === "rerun" || job.status === "failed")
					.map((job) => job.selection),
			);
	} catch (error) {
		showError(error);
		if (button.id === "refresh") button.disabled = false;
	}
});
document.addEventListener("change", (event) => {
	const input = event.target;
	if (input.dataset.fileCheck) {
		if (input.checked) state.selected.set(input.dataset.fileCheck, null);
		else state.selected.delete(input.dataset.fileCheck);
		renderFiles();
		if (!state.runId) renderInspector();
	}
	if (input.dataset.caseCheck) {
		const file = currentFile();
		let cases = state.selected.get(file.id);
		if (cases === null)
			cases = new Set(file.cases.filter((test) => test.runnable).map((test) => test.id));
		cases ??= new Set();
		if (input.checked) cases.add(input.dataset.caseCheck);
		else cases.delete(input.dataset.caseCheck);
		if (cases.size) state.selected.set(file.id, cases);
		else state.selected.delete(file.id);
		renderFiles();
	}
});
$("#search").addEventListener("input", (event) => {
	state.query = event.target.value.trim().toLowerCase();
	renderFiles();
});
$("#platform").addEventListener("change", (event) => {
	state.platform = event.target.value;
	renderFiles();
});
$("#workspace-picker").addEventListener("change", (event) => {
	state.workspace = event.target.value;
	summary();
	renderFiles();
});
document.addEventListener("keydown", (event) => {
	if (
		event.key === "/" &&
		!["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
	) {
		event.preventDefault();
		$("#search").focus();
	}
});
async function poll() {
	if (polling) return;
	polling = true;
	try {
		const [catalog, runs] = await Promise.all([api("/api/catalog"), api("/api/runs")]);
		applyCatalog(catalog);
		state.runs = runs;
		renderHistory();
		selectionCount();
		if (state.runId) {
			const id = state.runId;
			const run = await api(`/api/runs/${id}`);
			if (id === state.runId) {
				state.run = run;
				renderRun();
			}
		}
		$("#connection").textContent = "Auto-discovery is on";
		$(".sidebar-footer").classList.remove("offline");
	} catch (error) {
		$("#connection").textContent = "Disconnected · retrying…";
		$(".sidebar-footer").classList.add("offline");
		if (!state.catalog) showError(error);
	} finally {
		polling = false;
	}
}
poll();
setInterval(poll, 1200);

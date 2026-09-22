import { createServer } from "node:http";
import { loadProject, type Project } from "./config.ts";
import { readFile, realpath } from "node:fs/promises";
import { relative, sep, join } from "node:path";
import { scanProject } from "./discovery.ts";
import { TestRunner, validateRequest } from "./runner.ts";
export async function startServer(root: string, port?: number, loaded?: Project) {
	const project = loaded ?? (await loadProject(root));
	port ??= project.config.port;
	let catalog = await scanProject(root, project);
	let scanning: Promise<void> | undefined;
	let scanError: Error | undefined;
	const runner = new TestRunner(project.config.timeoutMs, project.adapters);
	const token = crypto.randomUUID();
	const html = (await readFile(new URL("./web/index.html", import.meta.url), "utf8")).replace(
		"__SESSION_TOKEN__",
		token,
	);
	const refresh = () =>
		(scanning ??= scanProject(root, project)
			.then((value) => {
				catalog = value;
				scanError = undefined;
			})
			.catch((error) => {
				scanError = error;
				catalog.warnings = [error.message];
			})
			.finally(() => {
				scanning = undefined;
			}));
	const json = (value: unknown, status = 200) =>
		Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
	async function handle(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const expected = `127.0.0.1:${actualPort}`;
		if (request.headers.get("host") !== expected) return json({ error: "Invalid host" }, 403);
		const origin = request.headers.get("origin");
		if (origin && origin !== `http://${expected}`)
			return json({ error: "Invalid origin" }, 403);
		if (
			url.pathname.startsWith("/api/") &&
			request.headers.get("x-test-studio-token") !== token
		)
			return json({ error: "Invalid session" }, 403);
		try {
			if (request.method === "GET" && url.pathname === "/")
				return new Response(html, {
					headers: {
						"Content-Type": "text/html; charset=utf-8",
						"Cache-Control": "no-store",
						"Content-Security-Policy":
							"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
						"X-Content-Type-Options": "nosniff",
					},
				});
			if (request.method === "GET" && ["/app.js", "/style.css"].includes(url.pathname))
				return new Response(
					await readFile(new URL(`./web${url.pathname}`, import.meta.url), "utf8"),
					{
						headers: {
							"Content-Type": url.pathname.endsWith(".js")
								? "text/javascript; charset=utf-8"
								: "text/css; charset=utf-8",
							"X-Content-Type-Options": "nosniff",
						},
					},
				);
			if (request.method === "GET" && url.pathname === "/api/catalog") return json(catalog);
			if (request.method === "POST" && url.pathname === "/api/scan") {
				await refresh();
				return json(catalog);
			}
			if (request.method === "GET" && url.pathname === "/api/runs")
				return json(
					runner.runs.map(({ jobs, ...run }) => ({
						...run,
						jobs: jobs.map((job) => ({
							id: job.id,
							selection: job.selection,
							status: job.status,
							command: job.command,
							startedAt: job.startedAt,
							finishedAt: job.finishedAt,
							exitCode: job.exitCode,
							file: {
								id: job.file.id,
								name: job.file.name,
								runner: job.file.runner,
								path: job.file.path,
							},
							resultCounts: {
								passed: job.results.filter((result) => result.status === "passed")
									.length,
								failed: job.results.filter((result) => result.status === "failed")
									.length,
								skipped: job.results.filter((result) => result.status === "skipped")
									.length,
							},
						})),
					})),
				);
			if (request.method === "POST" && url.pathname === "/api/run") {
				const { selections, options } = validateRequest(await request.json());
				await refresh();
				if (scanError) throw scanError;
				const run = await runner.start(catalog, selections, options);
				return json({ id: run.id }, 201);
			}
			const runMatch = url.pathname.match(/^\/api\/runs\/([a-f0-9-]+)(\/stop)?$/);
			if (runMatch) {
				const run = runner.runs.find((run) => run.id === runMatch[1]);
				if (!run) return json({ error: "Run not found" }, 404);
				if (request.method === "POST" && runMatch[2]) {
					runner.stop(run.id);
					return json({ ok: true });
				}
				if (request.method === "GET" && !runMatch[2]) return json(run);
			}
			if (request.method === "GET" && url.pathname === "/api/source") {
				const file = catalog.files.find((file) => file.id === url.searchParams.get("id"));
				if (!file) return json({ error: "File not found" }, 404);
				const path = await realpath(join(catalog.root, file.path));
				const inside = relative(catalog.root, path);
				if (inside === ".." || inside.startsWith(`..${sep}`))
					return json({ error: "File outside project" }, 403);
				return json({ source: await readFile(path, "utf8") });
			}
			return json({ error: "Not found" }, 404);
		} catch (cause) {
			const error = cause as Error;
			return json({ error: error.message ?? "Request failed" }, 400);
		}
	}
	let actualPort = 0;
	const server = createServer(async (incoming, outgoing) => {
		try {
			const chunks: Buffer[] = [];
			let size = 0;
			for await (const chunk of incoming) {
				size += chunk.length;
				if (size > 512000) {
					outgoing.writeHead(413, {
						"Content-Type": "application/json",
						Connection: "close",
					});
					outgoing.end(JSON.stringify({ error: "Request body too large" }));
					return;
				}
				chunks.push(chunk);
			}
			const headers = new Headers();
			for (const [key, value] of Object.entries(incoming.headers))
				if (value !== undefined)
					headers.set(key, Array.isArray(value) ? value.join(", ") : value);
			const request = new Request(
				new URL(incoming.url ?? "/", `http://127.0.0.1:${actualPort}`),
				{
					method: incoming.method,
					headers,
					...(!["GET", "HEAD"].includes(incoming.method ?? "GET") && size
						? { body: Buffer.concat(chunks) }
						: {}),
				},
			);
			const response = await handle(request);
			outgoing.writeHead(response.status, Object.fromEntries(response.headers));
			outgoing.end(Buffer.from(await response.arrayBuffer()));
		} catch (cause) {
			if (!outgoing.headersSent)
				outgoing.writeHead(400, { "Content-Type": "application/json" });
			outgoing.end(JSON.stringify({ error: (cause as Error).message }));
		}
	});
	server.requestTimeout = 30000;
	server.timeout = 30000;
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Unable to determine server port.");
	actualPort = address.port;
	const interval = setInterval(refresh, 5000);
	return {
		server: Object.assign(server, { port: actualPort }),
		runner,
		stop: () => {
			clearInterval(interval);
			runner.shutdown();
			server.close();
			server.closeAllConnections();
		},
	};
}

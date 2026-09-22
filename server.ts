import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, sep, join } from "node:path";
import { scanProject } from "./discovery.ts";
import { TestRunner, validateRequest } from "./runner.ts";
export async function startServer(root: string, port = 4310) {
	let catalog = await scanProject(root);
	let scanning: Promise<void> | undefined;
	const runner = new TestRunner();
	const token = crypto.randomUUID();
	const html = (await readFile(new URL("./web/index.html", import.meta.url), "utf8")).replace(
		"__SESSION_TOKEN__",
		token,
	);
	const refresh = () =>
		(scanning ??= scanProject(root)
			.then((value) => {
				catalog = value;
			})
			.catch((error) => {
				catalog.warnings = [error.message];
			})
			.finally(() => {
				scanning = undefined;
			}));
	const json = (value: unknown, status = 200) =>
		Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port,
		idleTimeout: 30,
		maxRequestBodySize: 512000,
		async fetch(request) {
			const url = new URL(request.url);
			const expected = `127.0.0.1:${server.port}`;
			if (request.headers.get("host") !== expected)
				return json({ error: "Invalid host" }, 403);
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
					return new Response(Bun.file(new URL(`./web${url.pathname}`, import.meta.url)));
				if (request.method === "GET" && url.pathname === "/api/catalog")
					return json(catalog);
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
									passed: job.results.filter(
										(result) => result.status === "passed",
									).length,
									failed: job.results.filter(
										(result) => result.status === "failed",
									).length,
									skipped: job.results.filter(
										(result) => result.status === "skipped",
									).length,
								},
							})),
						})),
					);
				if (request.method === "POST" && url.pathname === "/api/run") {
					const { selections, options } = validateRequest(await request.json());
					await refresh();
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
					const file = catalog.files.find(
						(file) => file.id === url.searchParams.get("id"),
					);
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
		},
	});
	const interval = setInterval(refresh, 5000);
	return {
		server,
		runner,
		stop: () => {
			clearInterval(interval);
			runner.shutdown();
			server.stop(true);
		},
	};
}
if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.includes("--help")) {
		console.log(
			"Test Studio\n\n  bun server.ts [project-path] [--port 4310]\n\nDefaults to the current directory. Open the printed URL. Bun and Maestro must be on PATH.",
		);
		process.exit(0);
	}
	let root = process.cwd();
	let port = 4310;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--port") port = Number(args[++i]);
		else if (!args[i].startsWith("-")) root = resolve(args[i]);
		else throw new Error(`Unknown option: ${args[i]}`);
	}
	if (!Number.isInteger(port) || port < 0 || port > 65535)
		throw new Error("Port must be between 0 and 65535.");
	const app = await startServer(root, port);
	console.log(
		`\n  Test Studio → http://127.0.0.1:${app.server.port}\n  Watching ${root}\n  Press Ctrl+C to stop.\n`,
	);
	for (const signal of ["SIGINT", "SIGTERM"] as const)
		process.on(signal, () => {
			app.stop();
			setTimeout(() => process.exit(0), 1700);
		});
}

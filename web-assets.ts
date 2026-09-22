import { readFile, readdir } from "node:fs/promises";
import { extname } from "node:path";

const contentTypes: Record<string, string> = {
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
};

/** Only exported files are addressable; request paths are never resolved on disk. */
export async function loadWebAssets(token: string) {
	const root = new URL(
		import.meta.url.endsWith(".ts") ? "./ui/dist/" : "./web/",
		import.meta.url,
	);
	const files = new Map<string, URL>();
	async function visit(directory: URL, prefix: string) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name.endsWith(".map")) continue;
			const path = `${prefix}/${entry.name}`;
			const url = new URL(
				encodeURIComponent(entry.name) + (entry.isDirectory() ? "/" : ""),
				directory,
			);
			if (entry.isDirectory()) await visit(url, path);
			else if (entry.isFile()) files.set(path, url);
		}
	}
	try {
		await visit(root, "");
	} catch (cause) {
		throw new Error("The compiled UI is missing. Run npm run build before starting the UI.", {
			cause,
		});
	}
	const entry = files.get("/index.html");
	if (!entry) throw new Error("The compiled UI is missing index.html. Run npm run build.");
	const template = await readFile(entry, "utf8");
	if (!template.includes("__SESSION_TOKEN__"))
		throw new Error("The compiled UI is missing its session placeholder. Run npm run build.");
	const html = template.replace("__SESSION_TOKEN__", token);
	return async (pathname: string): Promise<Response | undefined> => {
		if (pathname === "/" || pathname === "/index.html")
			return new Response(html, {
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "no-store",
					// React Native Web and styled-components generate style elements and inline styles.
					// Scripts remain restricted to files served by this origin.
					"Content-Security-Policy":
						"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
					"X-Content-Type-Options": "nosniff",
				},
			});
		const file = files.get(pathname);
		if (!file || extname(pathname) === ".html") return undefined;
		return new Response(new Uint8Array(await readFile(file)), {
			headers: {
				"Content-Type": contentTypes[extname(pathname)] ?? "application/octet-stream",
				"Cache-Control": "no-cache",
				"X-Content-Type-Options": "nosniff",
			},
		});
	};
}

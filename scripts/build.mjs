import { execFileSync } from "node:child_process";
import { chmod, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await rm(new URL("../dist/", import.meta.url), { recursive: true, force: true });
execFileSync(
	process.execPath,
	[
		fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url)),
		"-p",
		"tsconfig.build.json",
	],
	{ cwd: root, stdio: "inherit" },
);
await cp(new URL("../web/", import.meta.url), new URL("../dist/web/", import.meta.url), {
	recursive: true,
});
await chmod(new URL("../dist/cli.js", import.meta.url), 0o755);

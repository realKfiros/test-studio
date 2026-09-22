import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const app = new URL("../ui/", import.meta.url);
await rm(new URL("dist/", app), { recursive: true, force: true });
execFileSync(
	process.execPath,
	[
		fileURLToPath(new URL("../node_modules/expo/bin/cli", import.meta.url)),
		"export",
		"--platform",
		"web",
		"--output-dir",
		"dist",
	],
	{
		cwd: fileURLToPath(app),
		stdio: "inherit",
		env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
	},
);
const entry = new URL("dist/index.html", app);
const html = await readFile(entry, "utf8");
if (!html.includes("</head>")) throw new Error("Expo export is missing an HTML head.");
await writeFile(
	entry,
	html.replace("</head>", '<meta name="test-studio-token" content="__SESSION_TOKEN__" /></head>'),
);

import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { writeUiLicenses } from "./ui-licenses.mjs";

const app = new URL("../ui/", import.meta.url);
await rm(new URL("dist/", app), { recursive: true, force: true });
execFileSync(
	process.execPath,
	[
		fileURLToPath(new URL("../node_modules/expo/bin/cli", import.meta.url)),
		"export",
		"--platform",
		"web",
		"--source-maps",
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
	html.replace(
		"</head>",
		'<meta name="test-studio-token" content="__SESSION_TOKEN__" /><meta name="color-scheme" content="dark" /></head>',
	),
);

await writeUiLicenses(fileURLToPath(app), fileURLToPath(new URL("dist/", app)));

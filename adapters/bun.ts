import { relative, resolve } from "node:path";
import { defineAdapter } from "../adapter.ts";
import { discoverScript, testPath } from "../detectors.ts";
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export default defineAdapter({
	id: "bun",
	label: "Bun",
	executable: "bun",
	supportsIndividualTests: true,
	match: (path) => testPath.test(path),
	discover({ source, path, manifest, nearestConfig }) {
		const fallback = Object.values(manifest?.scripts ?? {}).some((script) =>
			/\bbun test\b/.test(script),
		)
			? "bun"
			: "unknown";
		const parsed = discoverScript(source, path, fallback);
		return parsed.runner === "bun" ? { ...parsed, cwd: nearestConfig("bunfig.toml") } : null;
	},
	command({ root, file, selection, reportPath }) {
		const cwd = resolve(root, file.cwd);
		const args = [
			"test",
			`./${relative(cwd, resolve(root, file.path))}`,
			"--reporter=junit",
			`--reporter-outfile=${reportPath}`,
		];
		if (selection.caseIds?.length) {
			const cases = selection.caseIds.map((id) => {
				const item = file.cases.find((item) => item.id === id);
				if (!item?.runnable)
					throw new Error(
						"This test requires a file-level run. Refresh discovery and select the file.",
					);
				return item;
			});
			args.push(
				"--test-name-pattern",
				`^(?:${[...new Set(cases.map((item) => escapeRegex(item.fullName)))].join("|")})$`,
			);
		}
		return { executable: "bun", args, cwd };
	},
});

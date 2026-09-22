import { resolve } from "node:path";
import { defineAdapter } from "../adapter.ts";
import { discoverMaestro } from "../detectors.ts";
export default defineAdapter({
	id: "maestro",
	label: "Maestro",
	executable: "maestro",
	match: (path) => /\.ya?ml$/.test(path),
	discover: ({ source, path }) => discoverMaestro(source, path),
	command({ root, file, selection, reportPath: report, options }) {
		if (selection.caseIds?.length)
			throw new Error("Maestro runs complete flows; individual steps are inspection only.");
		const args: string[] = [];
		if (options.device) args.push("--device", options.device);
		args.push(
			"test",
			"--format",
			"junit",
			"--output",
			report,
			"--debug-output",
			report.replace(/\.xml$/, "-debug"),
		);
		for (const [key, value] of Object.entries(options.env ?? {}))
			args.push("--env", `${key}=${value}`);
		args.push(resolve(root, file.path));
		return { executable: "maestro", args, cwd: resolve(root, file.cwd) };
	},
});

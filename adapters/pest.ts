import { resolve } from "node:path";
import type { Adapter } from "../adapter.ts";
import { defineCommandAdapter } from "./command-adapter.ts";
import { discoverPest } from "./pest-discovery.ts";
import { createPestOutputFormatter } from "./pest-output.ts";

export type PestOptions = {
	files?: string[];
	/** Project-relative Pest executable, run through PHP. */
	binary?: string;
	/** Project-relative PHPUnit XML configuration. */
	configuration?: string;
	/** Project-relative working directory; defaults to the nearest composer.json. */
	cwd?: string;
};
export default function createPestAdapter(options: PestOptions = {}): Adapter {
	for (const key of Object.keys(options))
		if (!["files", "binary", "configuration", "cwd"].includes(key))
			throw new Error(`Unknown Pest option: ${key}`);
	for (const key of ["binary", "configuration", "cwd"] as const)
		if (options[key] !== undefined && (typeof options[key] !== "string" || !options[key]))
			throw new Error(`Pest ${key} must be a non-empty path.`);
	const base = defineCommandAdapter({
		id: "pest",
		label: "Pest",
		executable: "php",
		files: options.files ?? ["**/tests/**/*.php"],
		args: [],
	});
	return {
		...base,
		supportsIndividualTests: true,
		createOutputFormatter: createPestOutputFormatter,
		discover(context) {
			const metadata = discoverPest(context.source, context.path);
			return (
				metadata && {
					...metadata,
					cwd: options.cwd ?? context.nearestConfig("composer.json"),
				}
			);
		},
		command({ root, file, reportPath, selection }) {
			const cwd = resolve(root, file.cwd);
			const binary = options.binary
				? resolve(root, options.binary)
				: resolve(cwd, "vendor/bin/pest");
			const args = [
				binary,
				...(options.configuration
					? ["--configuration", resolve(root, options.configuration)]
					: []),
				"--teamcity",
				"--log-junit",
				reportPath,
				resolve(root, file.path),
			];
			if (selection.caseIds?.length) {
				const names = selection.caseIds.map((id) => {
					const item = file.cases.find((item) => item.id === id);
					if (!item?.runnable)
						throw new Error(
							"This Pest test requires a whole-file run. Refresh discovery and select the file.",
						);
					return item.fullName.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
				});
				args.push("--filter", `/(?:^|::)(?:${[...new Set(names)].join("|")})$/u`);
			}
			return { executable: "php", cwd, args };
		},
	};
}

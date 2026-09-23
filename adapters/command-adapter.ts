import { relative, resolve } from "node:path";
import type { Adapter, DiscoveryContext, DiscoveredFile } from "../adapter.ts";

export type CommandAdapterOptions = {
	id: string;
	label?: string;
	/** Project-relative patterns supporting *, **, and ?. */
	files: string[];
	executable: string;
	/** Literal arguments; {file}, {relativeFile}, {root}, {cwd}, and {report} are substituted. */
	args: string[];
	/** Relative to the project root. Defaults to the nearest package directory. */
	cwd?: string;
};

export function matchFiles(patterns: string[]): (path: string) => boolean {
	const expressions = patterns.map((pattern) => {
		let source = "^";
		for (let i = 0; i < pattern.length; i++) {
			const char = pattern[i];
			if (char === "*" && pattern[i + 1] === "*") {
				i++;
				if (pattern[i + 1] === "/") {
					i++;
					source += "(?:.*/)?";
				} else source += ".*";
			} else if (char === "*") source += "[^/]*";
			else if (char === "?") source += "[^/]";
			else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		return new RegExp(source + "$");
	});
	return (path) => expressions.some((expression) => expression.test(path));
}
/** File-level command adapter with safe arguments and the standard JUnit result parser. */
export function defineCommandAdapter(
	options: CommandAdapterOptions & {
		discover?: (
			context: DiscoveryContext,
		) => DiscoveredFile | null | Promise<DiscoveredFile | null>;
	},
): Adapter {
	const { id, label = id, files, executable, args, cwd, discover } = options;
	for (const [key, value] of Object.entries({ id, label, executable }))
		if (typeof value !== "string" || !value.trim())
			throw new Error(`${key} must be a non-empty string.`);
	if (
		!Array.isArray(files) ||
		!files.length ||
		files.some(
			(file) =>
				typeof file !== "string" ||
				!file ||
				file.startsWith("/") ||
				file.includes("\\") ||
				/[[\]{}]/.test(file),
		)
	)
		throw new Error("files must contain relative glob patterns using *, **, or ?.");
	if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))
		throw new Error("args must be an array of strings.");
	if (cwd !== undefined && (typeof cwd !== "string" || !cwd))
		throw new Error("cwd must be a non-empty path.");
	for (const arg of args)
		for (const match of arg.matchAll(/\{([A-Za-z]+)\}/g))
			if (!["root", "file", "relativeFile", "cwd", "report"].includes(match[1]))
				throw new Error(`Unknown command placeholder: ${match[0]}`);
	return {
		id,
		label,
		executable,
		match: matchFiles(files),
		async discover(context) {
			const metadata = discover ? await discover(context) : {};
			return metadata === null
				? null
				: { ...metadata, cwd: cwd ?? metadata.cwd ?? context.workspace };
		},
		command({ root, file, reportPath, selection }) {
			if (selection.caseIds?.length)
				throw new Error(
					"Command adapters run complete files. Use the full adapter interface for individual tests.",
				);
			const directory = resolve(root, file.cwd);
			const values: Record<string, string> = {
				root,
				cwd: directory,
				file: resolve(root, file.path),
				relativeFile: relative(directory, resolve(root, file.path)),
				report: reportPath,
			};
			return {
				executable,
				cwd: directory,
				args: args.map((arg) =>
					arg.replace(
						/\{(root|cwd|file|relativeFile|report)\}/g,
						(_, key: string) => values[key],
					),
				),
			};
		},
	};
}

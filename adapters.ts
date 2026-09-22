import { dirname, delimiter, isAbsolute, join, resolve } from "node:path";
import which from "which";
import bun from "./adapters/bun.ts";
import maestro from "./adapters/maestro.ts";
import type { Command } from "./adapter.ts";
export type { Adapter, Command } from "./adapter.ts";
export { parseReport } from "./reports.ts";
export const adapters = [bun, maestro];

/** Prefer project-local tools, then executables from the launching shell. */
export function executablePath(executable: string, cwd: string): string | null {
	if (isAbsolute(executable) || executable.includes("/") || executable.includes("\\")) {
		return which.sync(resolve(cwd, executable), { nothrow: true });
	}
	const directories: string[] = [];
	let directory = cwd;
	while (true) {
		directories.push(join(directory, "node_modules", ".bin"));
		const parent = dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
	return which.sync(executable, {
		nothrow: true,
		path: [...directories, process.env.PATH ?? ""].join(delimiter),
	});
}
export function displayCommand(command: Command): string {
	const quote = (arg: string) =>
		/^[a-zA-Z0-9_./=:-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
	return [
		command.executable,
		...command.args.map((arg, i) =>
			command.args[i - 1] === "--env" ? `${arg.split("=")[0]}=<redacted>` : arg,
		),
	]
		.map(quote)
		.join(" ");
}

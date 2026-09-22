import type { Result, RunOptions, Selection, TestFile } from "./types.ts";

export type Manifest = {
	name?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};
export type DiscoveryContext = {
	root: string;
	/** Project-relative path with forward slashes. */
	path: string;
	source: string;
	/** Project-relative nearest package directory. */
	workspace: string;
	manifest?: Manifest;
	/** Project-relative nearest directory containing the named file, or the project root. */
	nearestConfig(name: string): string;
};
export type DiscoveredFile = Partial<
	Pick<TestFile, "name" | "cwd" | "cases" | "platform" | "appId" | "tags" | "steps" | "note">
>;
export type Command = {
	executable: string;
	args: string[];
	cwd: string;
	env?: Record<string, string>;
};
export type CommandContext = {
	root: string;
	file: TestFile;
	selection: Selection;
	reportPath: string;
	options: RunOptions;
};
export type ResultContext = {
	file: TestFile;
	reportPath: string;
	output: string;
	exitCode: number | null;
};
/** Adapters discover source without executing it and return literal process arguments. */
export interface Adapter {
	id: string;
	label: string;
	executable: string;
	supportsIndividualTests?: boolean;
	match(path: string): boolean;
	discover(context: DiscoveryContext): DiscoveredFile | null | Promise<DiscoveredFile | null>;
	command(context: CommandContext): Command;
	/** Defaults to reading reportPath as JUnit XML. Empty results never count as a pass. */
	parseResults?(context: ResultContext): Result[] | Promise<Result[]>;
}
export type AdapterFactory = (options: Record<string, unknown>) => Adapter | Promise<Adapter>;
export function defineAdapter<T extends Adapter>(adapter: T): T {
	return adapter;
}

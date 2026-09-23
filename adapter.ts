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
export type ProcessCommand = {
	executable: string;
	args: string[];
	cwd: string;
	env?: Record<string, string>;
};
export type Command = ProcessCommand & {
	/** Runs after the test process, including failed tests, within the same timeout and cancellation scope. */
	collectReport?: ProcessCommand;
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
/** A fresh formatter is created for each job so chunk boundaries and run state stay isolated. */
export type OutputFormatter = {
	write(chunk: string): string;
	end(): string;
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
	/** Optionally format stdout as it arrives; stderr and report collection remain unchanged. */
	createOutputFormatter?(): OutputFormatter;
	/** Defaults to reading reportPath as JUnit XML. Empty results never count as a pass. */
	parseResults?(context: ResultContext): Result[] | Promise<Result[]>;
}
export type AdapterFactory = (options: Record<string, unknown>) => Adapter | Promise<Adapter>;
export function defineAdapter<T extends Adapter>(adapter: T): T {
	return adapter;
}

export { defineAdapter } from "./adapter.ts";
export type {
	Adapter,
	AdapterFactory,
	Command,
	CommandContext,
	DiscoveryContext,
	DiscoveredFile,
	Manifest,
	ResultContext,
} from "./adapter.ts";
export { defineConfig } from "./config.ts";
export type { TestStudioConfig, AdapterEntry } from "./config.ts";
export { parseReport as parseJUnitReport } from "./reports.ts";
export { discoverScript, discoverMaestro } from "./detectors.ts";
export type { TestCase, TestFile, Result, RunOptions, Selection } from "./types.ts";

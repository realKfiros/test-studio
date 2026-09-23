export { defineAdapter } from "./adapter.ts";
export type {
	Adapter,
	AdapterFactory,
	Command,
	ProcessCommand,
	OutputFormatter,
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

export { defineCommandAdapter, matchFiles } from "./adapters/command-adapter.ts";
export type { CommandAdapterOptions } from "./adapters/command-adapter.ts";
export { withDockerCompose } from "./adapters/docker-compose.ts";
export type { DockerComposeOptions } from "./adapters/docker-compose.ts";
export { discoverPest } from "./adapters/pest-discovery.ts";
export { default as createPestAdapter } from "./adapters/pest.ts";
export type { PestOptions } from "./adapters/pest.ts";

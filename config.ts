import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createJiti } from "jiti";
import { adapters as builtins } from "./adapters.ts";
import type { Adapter, AdapterFactory } from "./adapter.ts";

export type AdapterEntry = string | { use: string; options?: Record<string, unknown> };
export type TestStudioConfig = {
	$schema?: string;
	name?: string;
	port?: number;
	/** Replaces the default ["bun", "maestro"] list. Local modules and installed packages are supported. */
	adapters?: AdapterEntry[];
	/** Gitignore-style patterns, relative to the project root. */
	exclude?: string[];
	ignoreFile?: string | false;
	respectGitignore?: boolean;
	timeoutMs?: number;
};
export type ResolvedConfig = Required<Omit<TestStudioConfig, "$schema" | "name">> &
	Pick<TestStudioConfig, "name">;
export type Project = {
	root: string;
	configPath?: string;
	config: ResolvedConfig;
	adapters: Adapter[];
};
export const configNames = ["ts", "mts", "cts", "js", "mjs", "cjs", "json"].map(
	(ext) => `test-studio.config.${ext}`,
);
export function defineConfig(config: TestStudioConfig): TestStudioConfig {
	return config;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
async function exists(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isFile();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}
function validateConfig(value: unknown): ResolvedConfig {
	if (!isRecord(value)) throw new Error("Configuration must export an object.");
	const keys = [
		"$schema",
		"name",
		"port",
		"adapters",
		"exclude",
		"ignoreFile",
		"respectGitignore",
		"timeoutMs",
	];
	for (const key of Object.keys(value))
		if (!keys.includes(key)) throw new Error(`Unknown configuration option: ${key}`);
	for (const key of ["$schema", "name"])
		if (value[key] !== undefined && (typeof value[key] !== "string" || !value[key]))
			throw new Error(`${key} must be a non-empty string.`);
	if (
		value.port !== undefined &&
		(!Number.isInteger(value.port) || Number(value.port) < 0 || Number(value.port) > 65535)
	)
		throw new Error("port must be an integer between 0 and 65535.");
	if (
		value.timeoutMs !== undefined &&
		(!Number.isInteger(value.timeoutMs) ||
			Number(value.timeoutMs) < 1 ||
			Number(value.timeoutMs) > 2147483647)
	)
		throw new Error("timeoutMs must be an integer between 1 and 2147483647.");
	if (
		value.exclude !== undefined &&
		(!Array.isArray(value.exclude) || value.exclude.some((item) => typeof item !== "string"))
	)
		throw new Error("exclude must be an array of patterns.");
	if (
		value.ignoreFile !== undefined &&
		value.ignoreFile !== false &&
		(typeof value.ignoreFile !== "string" || !value.ignoreFile)
	)
		throw new Error("ignoreFile must be a path or false.");
	if (value.respectGitignore !== undefined && typeof value.respectGitignore !== "boolean")
		throw new Error("respectGitignore must be a boolean.");
	if (value.adapters !== undefined) {
		if (!Array.isArray(value.adapters)) throw new Error("adapters must be an array.");
		for (const entry of value.adapters) {
			if (typeof entry === "string" && entry) continue;
			if (
				!isRecord(entry) ||
				typeof entry.use !== "string" ||
				!entry.use ||
				(entry.options !== undefined && !isRecord(entry.options)) ||
				Object.keys(entry).some((key) => !["use", "options"].includes(key))
			)
				throw new Error("Each adapter must be a module name/path or { use, options }.");
		}
	}
	return {
		port: 4310,
		adapters: ["bun", "maestro"],
		exclude: [],
		ignoreFile: ".teststudioignore",
		respectGitignore: true,
		timeoutMs: 30 * 60000,
		...value,
	} as ResolvedConfig;
}
function validateAdapter(value: unknown): asserts value is Adapter {
	if (
		!isRecord(value) ||
		typeof value.id !== "string" ||
		!/^[a-z][a-z0-9-]*$/.test(value.id) ||
		value.id === "all"
	)
		throw new Error(
			"Adapter id must use lowercase letters, digits, and hyphens, and cannot be 'all'.",
		);
	for (const key of ["label", "executable"])
		if (typeof value[key] !== "string" || !value[key])
			throw new Error(`Adapter ${value.id}: ${key} must be a non-empty string.`);
	for (const key of ["match", "discover", "command"])
		if (typeof value[key] !== "function")
			throw new Error(`Adapter ${value.id}: ${key} must be a function.`);
	if (value.parseResults !== undefined && typeof value.parseResults !== "function")
		throw new Error(`Adapter ${value.id}: parseResults must be a function.`);
	if (
		value.supportsIndividualTests !== undefined &&
		typeof value.supportsIndividualTests !== "boolean"
	)
		throw new Error(`Adapter ${value.id}: supportsIndividualTests must be a boolean.`);
}
/** Load trusted configuration and adapters once. Restart the server after editing either. */
export async function loadProject(rootInput: string, configFile?: string): Promise<Project> {
	const root = await realpath(rootInput);
	if (!(await stat(root)).isDirectory())
		throw new Error(`Project root is not a directory: ${root}`);
	let configPath: string | undefined;
	if (configFile) {
		configPath = resolve(root, configFile);
		if (!(await exists(configPath)))
			throw new Error(`Configuration file not found: ${configPath}`);
	} else {
		const found: string[] = [];
		for (const name of configNames)
			if (await exists(join(root, name))) found.push(join(root, name));
		if (found.length > 1)
			throw new Error("Multiple Test Studio config files found. Choose one with --config.");
		configPath = found[0];
	}
	const loader = createJiti(configPath ?? join(root, "test-studio.config.ts"), {
		fsCache: false,
		moduleCache: false,
	});
	let config: ResolvedConfig;
	try {
		const raw = !configPath
			? {}
			: configPath.endsWith(".json")
				? JSON.parse(await readFile(configPath, "utf8"))
				: await loader.import(configPath, { default: true });
		config = validateConfig(raw);
	} catch (cause) {
		throw new Error(`${configPath ?? "Test Studio config"}: ${(cause as Error).message}`, {
			cause,
		});
	}
	const adapters: Adapter[] = [];
	for (const entry of config.adapters) {
		const { use, options = {} } = typeof entry === "string" ? { use: entry } : entry;
		try {
			let adapter: unknown = builtins.find((adapter) => adapter.id === use);
			if (adapter && Object.keys(options).length)
				throw new Error("Built-in adapters do not accept options yet.");
			if (!adapter) {
				const specifier = use.startsWith(".")
					? resolve(configPath ? dirname(configPath) : root, use)
					: use;
				const exported = await loader.import<Adapter | AdapterFactory>(specifier, {
					default: true,
				});
				adapter = typeof exported === "function" ? await exported(options) : exported;
				if (typeof exported !== "function" && Object.keys(options).length)
					throw new Error("Adapter options require a factory export.");
			}
			validateAdapter(adapter);
			if (adapters.some((existing) => existing.id === adapter.id))
				throw new Error(`Duplicate adapter id: ${adapter.id}`);
			adapters.push(adapter);
		} catch (cause) {
			throw new Error(`Unable to load adapter "${use}": ${(cause as Error).message}`, {
				cause,
			});
		}
	}
	return { root, configPath, config, adapters };
}

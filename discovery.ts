import { readdir, readFile, stat, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { parseAllDocuments, isSeq, isMap, isScalar } from "yaml";
import type { Catalog, TestCase, TestFile } from "./types.ts";
const ignored = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"coverage",
	"vendor",
	"Pods",
	"DerivedData",
	"graphify-out",
	"android",
	"ios",
	"test-results",
	"playwright-report",
]);
const testPath = /(?:[._](?:test|spec))\.[cm]?[jt]sx?$|(?:^|\/)__tests__\/.*\.[cm]?[jt]sx?$/;
const imports = new Map([
	["bun:test", "bun"],
	["vitest", "vitest"],
	["@jest/globals", "jest"],
	["node:test", "node:test"],
	["@playwright/test", "playwright"],
]);
const cache = new Map<
	string,
	{
		stamp: string;
		value: Partial<TestFile> | null;
	}
>();
const literal = (node?: ts.Node): string | undefined =>
	node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
		? node.text
		: undefined;
/** Parse declarations without importing test code (and therefore without running hooks). */
export function discoverScript(
	source: string,
	path: string,
	fallback = "unknown",
): Partial<TestFile> {
	const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
	const aliases = new Map<string, string>();
	const namespaces = new Set<string>();
	let runner = fallback;
	for (const statement of ast.statements) {
		if (!ts.isImportDeclaration(statement)) continue;
		const framework = imports.get(literal(statement.moduleSpecifier) ?? "");
		if (!framework) continue;
		runner = framework;
		const bindings = statement.importClause?.namedBindings;
		if (bindings && ts.isNamedImports(bindings))
			for (const item of bindings.elements)
				aliases.set(item.name.text, item.propertyName?.text ?? item.name.text);
		if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
		if (statement.importClause?.name) aliases.set(statement.importClause.name.text, "test");
	}
	const cases: TestCase[] = [];
	function callParts(expr: ts.Expression): string[] {
		if (ts.isIdentifier(expr)) return [aliases.get(expr.text) ?? expr.text];
		if (ts.isPropertyAccessExpression(expr)) {
			if (ts.isIdentifier(expr.expression) && namespaces.has(expr.expression.text))
				return [expr.name.text];
			return [...callParts(expr.expression), expr.name.text];
		}
		if (ts.isCallExpression(expr) || ts.isTaggedTemplateExpression(expr))
			return callParts(ts.isCallExpression(expr) ? expr.expression : expr.tag);
		return [];
	}
	function visit(node: ts.Node, parents: string[], dynamic: boolean, inheritedMode: string) {
		if (ts.isCallExpression(node)) {
			const parts = callParts(node.expression);
			const kind = parts[0];
			if (["describe", "test", "it"].includes(kind)) {
				const callback = node.arguments.find(
					(arg) => ts.isArrowFunction(arg) || ts.isFunctionExpression(arg),
				);
				const name = literal(node.arguments[0]);
				const isDeclaration = callback || parts.includes("todo");
				if (isDeclaration) {
					const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
					const uncertain =
						dynamic ||
						name === undefined ||
						parts.some((part) => ["each", "for"].includes(part));
					const mode =
						parts.find((part) => ["skip", "todo", "only"].includes(part)) ??
						inheritedMode;
					const label = name ?? node.arguments[0]?.getText(ast) ?? "Unnamed test";
					if (kind === "describe") {
						if (
							callback &&
							(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
						)
							visit(callback.body, [...parents, label], uncertain, mode);
					} else {
						const fullName = [...parents, label].join(" ");
						cases.push({
							id: `${path}:${line}:${cases.length}:${Bun.hash(fullName)}`,
							name: label,
							fullName,
							line,
							mode: uncertain ? "dynamic" : mode,
							runnable: !uncertain && !["skip", "todo"].includes(mode),
						});
					}
					return;
				}
			}
		}
		// Names generated inside loops cannot be selected reliably with a static name filter.
		const loop =
			ts.isForStatement(node) ||
			ts.isForOfStatement(node) ||
			ts.isForInStatement(node) ||
			ts.isWhileStatement(node) ||
			ts.isFunctionDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node);
		ts.forEachChild(node, (child) => visit(child, parents, dynamic || loop, inheritedMode));
	}
	visit(ast, [], false, "normal");
	const names = new Map<string, number>();
	for (const item of cases) names.set(item.fullName, (names.get(item.fullName) ?? 0) + 1);
	for (const item of cases)
		if (names.get(item.fullName)! > 1 && item.runnable) {
			item.mode = "duplicate";
			item.runnable = false;
		}
	return {
		runner,
		cases,
		note:
			runner === "unknown"
				? "No supported test library was identified. Add an explicit bun:test import for Bun tests."
				: cases.some((item) => ["dynamic", "duplicate"].includes(item.mode))
					? "Generated or duplicate test names run at file level. Individual selection is available for unique static names."
					: undefined,
	};
}
export function discoverMaestro(source: string, path: string): Partial<TestFile> | null {
	const documents = parseAllDocuments(source);
	if (documents.some((doc) => doc.errors.length)) {
		if (/^appId:/m.test(source)) throw new Error("Invalid Maestro YAML");
		return null;
	}
	const config = documents[0]?.toJS();
	if (!config || typeof config.appId !== "string" || !isSeq(documents[1]?.contents)) return null;
	const sequence = documents[1].contents;
	const steps = sequence.items.map((node) => {
		const value = isMap(node) ? node.toJSON() : isScalar(node) ? node.value : node;
		const key = value && typeof value === "object" ? Object.keys(value)[0] : String(value);
		const detail = value && typeof value === "object" ? value[key] : undefined;
		const label =
			typeof detail === "string" || typeof detail === "number"
				? detail
				: (detail?.label ?? detail?.text ?? detail?.id);
		const offset =
			node && typeof node === "object" && "range" in node ? (node.range?.[0] ?? 0) : 0;
		return {
			name: label ? `${key}: ${label}` : key,
			line: source.slice(0, offset).split("\n").length,
		};
	});
	return {
		runner: "maestro",
		name:
			typeof config.name === "string" ? config.name : basename(path).replace(/\.ya?ml$/, ""),
		appId: config.appId,
		platform: /(?:-|\.)ios\.ya?ml$/.test(path)
			? "ios"
			: /(?:-|\.)android\.ya?ml$/.test(path)
				? "android"
				: "any",
		tags: Array.isArray(config.tags) ? config.tags.map(String) : [],
		cases: [],
		steps,
	};
}
export async function scanProject(rootInput: string): Promise<Catalog> {
	const root = await realpath(rootInput);
	const files: string[] = [];
	const warnings: string[] = [];
	const manifests = new Map<
		string,
		{
			name?: string;
			scripts?: Record<string, string>;
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		}
	>();
	const bunConfigs = new Set<string>();
	// Git knows about generated output directories without hardcoding project-specific paths.
	// Include untracked files, so a newly written test appears before it is committed.
	const git = spawnSync(
		"git",
		["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
		{ encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
	);
	const gitFiles = git.status === 0 ? new Set(git.stdout.split("\0")) : null;
	const gitDirectories = new Set<string>();
	for (const path of gitFiles ?? []) {
		let dir = dirname(path);
		while (dir !== ".") {
			gitDirectories.add(dir);
			dir = dirname(dir);
		}
	}
	let exclude: string[] = [];
	try {
		const config = JSON.parse(await readFile(join(root, "test-studio.config.json"), "utf8"));
		if (
			!Array.isArray(config.exclude) ||
			config.exclude.some((item: unknown) => typeof item !== "string")
		)
			throw new Error("exclude must be an array of glob strings");
		exclude = config.exclude;
	} catch (cause) {
		const error = cause as NodeJS.ErrnoException;
		if (error.code !== "ENOENT") warnings.push(`test-studio.config.json: ${error.message}`);
	}
	const patterns = exclude.map((pattern) => new Bun.Glob(pattern));
	async function walk(dir: string) {
		const entries = await readdir(dir, { withFileTypes: true });
		// Nested checkouts and submodules are separate projects, not part of this catalog.
		if (dir !== root && entries.some((entry) => entry.name === ".git")) return;
		for (const entry of entries) {
			const absolute = join(dir, entry.name);
			const path = relative(root, absolute).split(sep).join("/");
			if (
				entry.isSymbolicLink() ||
				patterns.some((pattern) => pattern.match(path) || pattern.match(`${path}/`))
			)
				continue;
			if (entry.isDirectory()) {
				if (gitFiles && !gitDirectories.has(path)) continue;
				if (
					!ignored.has(entry.name) &&
					(!entry.name.startsWith(".") || entry.name === ".maestro")
				) {
					try {
						await walk(absolute);
					} catch (cause) {
						const error = cause as NodeJS.ErrnoException;
						warnings.push(`${path}: ${error.message}`);
					}
				}
			} else if (gitFiles && !gitFiles.has(path)) continue;
			else if (entry.name === "package.json") {
				try {
					manifests.set(dir, JSON.parse(await readFile(absolute, "utf8")));
				} catch {
					warnings.push(`${path}: invalid package manifest`);
				}
			} else if (entry.name === "bunfig.toml") bunConfigs.add(dir);
			else if (testPath.test(path) || /\.ya?ml$/.test(path)) files.push(path);
		}
	}
	await walk(root);
	function nearest(
		path: string,
		matches: {
			has(key: string): boolean;
		},
	) {
		let dir = dirname(join(root, path));
		while (dir !== root) {
			if (matches.has(dir)) return dir;
			dir = dirname(dir);
		}
		return root;
	}
	const libraries = new Set<string>();
	for (const manifest of manifests.values()) {
		for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
			if (
				[
					"vitest",
					"jest",
					"@playwright/test",
					"mocha",
					"cypress",
					"bun-types",
					"@types/bun",
				].includes(dep)
			)
				libraries.add(dep.includes("bun") ? "bun" : dep);
		}
		if (
			Object.values(manifest.scripts ?? {}).some((script) =>
				/\bbun test\b/.test(String(script)),
			)
		)
			libraries.add("bun");
		if (
			Object.values(manifest.scripts ?? {}).some((script) =>
				/\bmaestro test\b/.test(String(script)),
			)
		)
			libraries.add("maestro");
	}
	const catalog: TestFile[] = [];
	for (const path of files.sort()) {
		const absolute = join(root, path);
		try {
			const info = await stat(absolute);
			if (info.size > 2000000) {
				if (testPath.test(path)) warnings.push(`${path}: skipped (larger than 2 MB)`);
				continue;
			}
			const workspace = nearest(path, manifests);
			const manifest = manifests.get(workspace);
			const fallback = Object.values(manifest?.scripts ?? {}).some((script) =>
				/\bbun test\b/.test(String(script)),
			)
				? "bun"
				: "unknown";
			const stamp = `${info.mtimeMs}:${info.size}:${fallback}`;
			let parsed =
				cache.get(absolute)?.stamp === stamp ? cache.get(absolute)!.value : undefined;
			if (parsed === undefined) {
				const source = await readFile(absolute, "utf8");
				parsed = testPath.test(path)
					? discoverScript(source, path, fallback)
					: discoverMaestro(source, path);
				cache.set(absolute, { stamp, value: parsed });
			}
			if (!parsed) continue;
			if (parsed.runner !== "unknown") libraries.add(parsed.runner!);
			const cwd = parsed.runner === "maestro" ? workspace : nearest(path, bunConfigs);
			catalog.push({
				id: path,
				path,
				workspace: relative(root, workspace) || ".",
				cwd: relative(root, cwd) || ".",
				name: basename(path),
				runner: "unknown",
				cases: [],
				...parsed,
			});
		} catch (cause) {
			const error = cause as NodeJS.ErrnoException;
			warnings.push(`${path}: ${error.message}`);
		}
	}
	return {
		root,
		name: manifests.get(root)?.name ?? basename(root),
		scannedAt: new Date().toISOString(),
		files: catalog,
		libraries: [...libraries].sort(),
		warnings,
		runners: ["bun", "maestro"].map((id) => ({
			id,
			available: !!Bun.which(id),
			path: Bun.which(id),
		})),
	};
}

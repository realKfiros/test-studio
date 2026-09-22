import { basename } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { parseAllDocuments, isSeq, isMap, isScalar } from "yaml";
import type { TestCase, TestFile } from "./types.ts";
export const testPath = /(?:[._](?:test|spec))\.[cm]?[jt]sx?$|(?:^|\/)__tests__\/.*\.[cm]?[jt]sx?$/;
const imports = new Map([
	["bun:test", "bun"],
	["vitest", "vitest"],
	["@jest/globals", "jest"],
	["node:test", "node:test"],
	["@playwright/test", "playwright"],
]);
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
							id: `${path}:${line}:${cases.length}:${createHash("sha256").update(fullName).digest("hex").slice(0, 16)}`,
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

import { Engine } from "php-parser";
import type { DiscoveredFile } from "../adapter.ts";
import type { TestCase } from "../types.ts";

// php-parser's nodes are class based; this view describes just the syntax discovery uses.
type Node = {
	kind: string;
	name?: string;
	value?: string;
	children?: Node[];
	arguments?: Node[];
	expression?: Node;
	what?: Node;
	offset?: Node;
	body?: Node;
	loc?: { start: { line: number; offset: number } };
};
const parser = new Engine({ ast: { withPositions: true }, parser: { version: "8.4" } });
function literal(node?: Node): string | undefined {
	return node?.kind === "string" ? node.value : undefined;
}
function declaration(expression: Node) {
	const methods: Node[] = [];
	let call = expression;
	while (call.kind === "call" && call.what?.kind === "propertylookup" && call.what.what) {
		methods.push(call);
		call = call.what.what;
	}
	const name = call.what?.kind === "name" ? call.what.name?.replace(/^\\/, "") : undefined;
	if (call.kind !== "call" || !name || !["describe", "test", "it", "todo"].includes(name))
		return null;
	return { call, name, methods };
}
/** Discover literal Pest declarations without loading PHP or running project code. */
export function discoverPest(source: string, path: string): DiscoveredFile | null {
	let ast: Node;
	try {
		ast = parser.parseCode(source, path) as unknown as Node;
	} catch {
		return {
			cases: [],
			note: "PHP could not be parsed. Run the complete file to let Pest report the error.",
		};
	}
	const cases: TestCase[] = [];
	const tags = new Set<string>();
	let found = false;
	function walk(node: Node, parents: string[] = [], unsafe = false, skipped = false) {
		if (node.kind === "expressionstatement" && node.expression) {
			const item = declaration(node.expression);
			if (!item) return;
			found = true;
			const text = literal(item.call.arguments?.[0]);
			const methodNames = item.methods.map((method) => method.what?.offset?.name);
			for (const method of item.methods)
				if (method.what?.offset?.name === "group")
					for (const argument of method.arguments ?? []) {
						const tag = literal(argument);
						if (tag) tags.add(tag);
					}
			const dynamic =
				unsafe ||
				text === undefined ||
				methodNames.some((name) => ["with", "withRepeat", "repeat"].includes(name ?? ""));
			const disabled =
				skipped ||
				item.name === "todo" ||
				methodNames.some((name) => ["skip", "todo"].includes(name ?? ""));
			if (item.name === "describe") {
				const callback = item.call.arguments?.[1];
				if (callback?.kind === "closure" && callback.body)
					walk(
						callback.body,
						[...parents, `\`${text ?? "<dynamic group>"}\``],
						dynamic,
						disabled,
					);
				return;
			}
			const name = (item.name === "it" ? "it " : "") + (text ?? "<dynamic test>");
			const fullName = [...parents, name].join(" → ");
			cases.push({
				id: `pest:${item.call.loc?.start.offset ?? cases.length}:${fullName}`,
				name,
				fullName,
				line: item.call.loc?.start.line ?? 1,
				mode: disabled ? "skip" : dynamic ? "dynamic" : "normal",
				runnable: !dynamic && !disabled,
			});
			return;
		}
		if (["program", "block", "namespace"].includes(node.kind)) {
			for (const child of node.children ?? []) walk(child, parents, unsafe, skipped);
		} else if (
			["if", "for", "foreach", "while", "do", "switch", "case", "try", "catch"].includes(
				node.kind,
			)
		) {
			// Declarations under control flow can have names/counts that depend on runtime values.
			for (const [key, value] of Object.entries(node)) {
				if (key === "loc") continue;
				for (const child of Array.isArray(value) ? value : [value])
					if (child && typeof child === "object" && "kind" in child)
						walk(child as Node, parents, true, skipped);
			}
		}
	}
	walk(ast);
	const counts = new Map<string, number>();
	for (const item of cases) counts.set(item.fullName, (counts.get(item.fullName) ?? 0) + 1);
	for (const item of cases) if (counts.get(item.fullName)! > 1) item.runnable = false;
	if (!found && !/(?:Test|test)(?:\.class)?\.php$/.test(path)) return null;
	return {
		cases,
		tags: [...tags],
		...(cases.some((item) => !item.runnable)
			? {
					note: "Dynamic, dataset, skipped, and duplicate declarations require a whole-file run.",
				}
			: {}),
	};
}

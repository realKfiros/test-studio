import { XMLParser } from "fast-xml-parser";
import type { Result } from "./types.ts";
export function parseReport(xml: string): Result[] {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "",
		parseAttributeValue: false,
		processEntities: false,
		isArray: (name) => ["testsuite", "testcase"].includes(name),
	});
	// Reports contain test text only; never resolve external entities or declarations.
	if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML declarations are not supported");
	const parsed = parser.parse(xml);
	const results: Result[] = [];
	const entities: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };
	const decode = (value: unknown): string =>
		String(value ?? "").replace(
			/&(lt|gt|quot|apos|amp);/g,
			(_, entity: string) => entities[entity],
		);
	type ReportFailure = string | { "#text"?: string; message?: string };
	type ReportNode = {
		testcase?: {
			name?: string;
			classname?: string;
			time?: string;
			failure?: ReportFailure;
			error?: ReportFailure;
			skipped?: unknown;
		}[];
		testsuites?: ReportNode;
		testsuite?: ReportNode[];
	};
	function visit(node?: ReportNode) {
		if (!node || typeof node !== "object") return;
		for (const item of node.testcase ?? []) {
			const problem = item.failure ?? item.error;
			results.push({
				name: decode([item.classname, item.name].filter(Boolean).join(" › ")),
				status:
					problem !== undefined
						? "failed"
						: item.skipped !== undefined
							? "skipped"
							: "passed",
				duration: (Number(item.time) || 0) * 1000,
				message:
					problem === undefined
						? undefined
						: decode(
								typeof problem === "string"
									? problem
									: problem["#text"] || problem.message || "Test failed",
							),
			});
		}
		if (node.testsuites) visit(node.testsuites);
		for (const suite of node.testsuite ?? []) visit(suite);
	}
	visit(parsed);
	return results;
}

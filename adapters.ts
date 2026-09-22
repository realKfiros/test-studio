import { XMLParser } from "fast-xml-parser";
import { relative, resolve } from "node:path";
import type { Result, RunOptions, Selection, TestFile } from "./types.ts";
export type Command = {
    executable: string;
    args: string[];
    cwd: string;
};
export type Adapter = {
    id: string;
    command(root: string, file: TestFile, selection: Selection, report: string, options: RunOptions): Command;
};
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const adapters: Adapter[] = [
    {
        id: "bun",
        command(root, file, selection, report) {
            const cwd = resolve(root, file.cwd);
            const args = ["test", `./${relative(cwd, resolve(root, file.path))}`, "--reporter=junit", `--reporter-outfile=${report}`];
            if (selection.caseIds?.length) {
                const cases = selection.caseIds.map(id => {
                    const item = file.cases.find(item => item.id === id);
                    if (!item?.runnable)
                        throw new Error("This test requires a file-level run. Refresh discovery and select the file.");
                    return item;
                });
                args.push("--test-name-pattern", `^(?:${[...new Set(cases.map(item => escapeRegex(item.fullName)))].join("|")})$`);
            }
            return { executable: "bun", args, cwd };
        },
    },
    {
        id: "maestro",
        command(root, file, selection, report, options) {
            if (selection.caseIds?.length)
                throw new Error("Maestro runs complete flows; individual steps are inspection only.");
            const args: string[] = [];
            if (options.device)
                args.push("--device", options.device);
            args.push("test", "--format", "junit", "--output", report, "--debug-output", report.replace(/\.xml$/, "-debug"));
            for (const [key, value] of Object.entries(options.env ?? {}))
                args.push("--env", `${key}=${value}`);
            args.push(resolve(root, file.path));
            return { executable: "maestro", args, cwd: resolve(root, file.cwd) };
        },
    },
];
export function displayCommand(command: Command): string {
    const quote = (arg: string) => /^[a-zA-Z0-9_./=:-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
    return [command.executable, ...command.args.map((arg, i) => command.args[i - 1] === "--env" ? `${arg.split("=")[0]}=<redacted>` : arg)].map(quote).join(" ");
}
export function parseReport(xml: string): Result[] {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false, processEntities: false, isArray: name => ["testsuite", "testcase"].includes(name) });
    // Reports contain test text only; never resolve external entities or declarations.
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
        throw new Error("XML declarations are not supported");
    const parsed = parser.parse(xml);
    const results: Result[] = [];
    const entities: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };
    const decode = (value: unknown): string => String(value ?? "").replace(/&(lt|gt|quot|apos|amp);/g, (_, entity: string) => entities[entity]);
    function visit(node: any) {
        if (!node || typeof node !== "object")
            return;
        for (const item of node.testcase ?? []) {
            const problem = item.failure ?? item.error;
            results.push({ name: decode([item.classname, item.name].filter(Boolean).join(" › ")), status: problem !== undefined ? "failed" : item.skipped !== undefined ? "skipped" : "passed", duration: (Number(item.time) || 0) * 1000, message: problem === undefined ? undefined : decode(typeof problem === "string" ? problem : problem["#text"] || problem.message || "Test failed") });
        }
        if (node.testsuites)
            visit(node.testsuites);
        for (const suite of node.testsuite ?? [])
            visit(suite);
    }
    visit(parsed);
    return results;
}

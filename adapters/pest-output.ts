import type { OutputFormatter } from "../adapter.ts";

function decode(value: string): string {
	return value.replace(/\|(0x[0-9a-fA-F]{4}|.)/g, (_, escaped: string) => {
		if (escaped.startsWith("0x")) return String.fromCodePoint(parseInt(escaped.slice(2), 16));
		return { n: "\n", r: "\r" }[escaped] ?? escaped;
	});
}

function attributes(source: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const match of source.matchAll(/([A-Za-z]+)='((?:\|.|[^'])*)'/g))
		values[match[1]] = decode(match[2]);
	return values;
}

/** Turn Pest's live TeamCity events into readable output without waiting for JUnit. */
export function createPestOutputFormatter(): OutputFormatter {
	let pending = "";
	const failed = new Set<string>();
	const skipped = new Set<string>();
	function format(line: string, terminated = true): string {
		const text = line.endsWith("\r") ? line.slice(0, -1) : line;
		const event = /^##teamcity\[([A-Za-z]+)(?:\s(.*))?\]$/.exec(text);
		if (!event) return text + (terminated ? "\n" : "");
		const values = attributes(event[2] ?? "");
		const name = values.name;
		const key = `${values.flowId ?? ""}\0${name}`;
		switch (event[1]) {
			case "testStarted":
				return name ? `RUN ${name}\n` : "";
			case "testFailed":
				failed.add(key);
				return `FAIL ${name ?? "test"}${values.message ? `: ${values.message.split("\n")[0]}` : ""}\n`;
			case "testIgnored":
				skipped.add(key);
				return `SKIP ${name ?? "test"}${values.message ? `: ${values.message.split("\n")[0]}` : ""}\n`;
			case "testFinished":
				if (failed.delete(key) || skipped.delete(key)) return "";
				return name
					? `PASS ${name}${values.duration ? ` (${values.duration} ms)` : ""}\n`
					: "";
			case "testStdOut":
			case "testStdErr": {
				const output = values.out ?? "";
				return output && !output.endsWith("\n") ? `${output}\n` : output;
			}
			case "testSuiteStarted":
			case "testSuiteFinished":
			case "testCount":
				return "";
			default:
				return text + (terminated ? "\n" : "");
		}
	}
	return {
		write(chunk) {
			pending += chunk;
			let output = "";
			let newline: number;
			while ((newline = pending.indexOf("\n")) !== -1) {
				output += format(pending.slice(0, newline));
				pending = pending.slice(newline + 1);
			}
			if (pending.length > 100000) {
				output += pending;
				pending = "";
			}
			return output;
		},
		end() {
			const output = pending ? format(pending, false) : "";
			pending = "";
			return output;
		},
	};
}

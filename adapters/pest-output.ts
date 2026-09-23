import type { OutputFormatter } from "../adapter.ts";
import type { Result } from "../types.ts";

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
	const results: Result[] = [];
	const active = new Map<string, Result>();
	function record(
		key: string,
		name: string | undefined,
		status: Result["status"],
		message?: string,
	) {
		if (!name) return;
		const result = active.get(key);
		if (result) {
			result.status = status;
			result.message = message;
			return;
		}
		const next: Result = { name, status, duration: 0, ...(message ? { message } : {}) };
		results.push(next);
		active.set(key, next);
	}
	function format(line: string, terminated = true): string {
		const text = line.endsWith("\r") ? line.slice(0, -1) : line;
		const event = /^##teamcity\[([A-Za-z]+)(?:\s(.*))?\]$/.exec(text);
		if (!event) return text + (terminated ? "\n" : "");
		const values = attributes(event[2] ?? "");
		const name = values.name;
		const key = `${values.flowId ?? ""}\0${name}`;
		switch (event[1]) {
			case "testStarted":
				active.delete(key);
				return name ? `RUN ${name}\n` : "";
			case "testFailed":
				record(key, name, "failed", values.message);
				return `FAIL ${name ?? "test"}${values.message ? `: ${values.message.split("\n")[0]}` : ""}\n`;
			case "testIgnored":
				record(key, name, "skipped", values.message);
				return `SKIP ${name ?? "test"}${values.message ? `: ${values.message.split("\n")[0]}` : ""}\n`;
			case "testFinished": {
				const result = active.get(key);
				active.delete(key);
				const elapsed = Number(values.duration);
				const duration = Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
				if (result) {
					result.duration = duration;
					return "";
				}
				if (name) results.push({ name, status: "passed", duration });
				return name
					? `PASS ${name}${values.duration ? ` (${values.duration} ms)` : ""}\n`
					: "";
			}
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
		results,
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

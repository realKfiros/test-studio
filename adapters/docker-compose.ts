import { basename, dirname, posix, resolve } from "node:path";
import type { Adapter } from "../adapter.ts";

export type DockerComposeOptions = {
	/** Compose service must already be running. */
	service: string;
	/** Absolute path where this project root is mounted in the container. */
	projectRoot: string;
	/** Compose file relative to the scanned project root. */
	file?: string;
};
/** Run the adapter inside an existing Compose service, then collect its JUnit report. */
export function withDockerCompose(adapter: Adapter, options: DockerComposeOptions): Adapter {
	if (
		!options ||
		typeof options.service !== "string" ||
		!options.service ||
		options.service.startsWith("-") ||
		typeof options.projectRoot !== "string" ||
		!posix.isAbsolute(options.projectRoot) ||
		(options.file !== undefined && (typeof options.file !== "string" || !options.file)) ||
		Object.keys(options).some((key) => !["service", "projectRoot", "file"].includes(key))
	)
		throw new Error(
			"docker requires service, an absolute projectRoot, and an optional Compose file.",
		);
	return {
		...adapter,
		executable: "docker",
		command(context) {
			const reportPath = `/tmp/${basename(dirname(context.reportPath))}-${basename(context.reportPath)}`;
			const command = adapter.command({ ...context, root: options.projectRoot, reportPath });
			if (command.collectReport)
				throw new Error(
					"Docker wrapping does not support an adapter with its own report collection command.",
				);
			const compose = [
				"compose",
				...(options.file ? ["-f", resolve(context.root, options.file)] : []),
			];
			return {
				executable: "docker",
				cwd: context.root,
				args: [
					...compose,
					"exec",
					"-T",
					"--workdir",
					command.cwd,
					...Object.entries(command.env ?? {}).flatMap(([key, value]) => [
						"--env",
						`${key}=${value}`,
					]),
					options.service,
					command.executable,
					...command.args,
				],
				collectReport: {
					executable: "docker",
					cwd: context.root,
					args: [
						...compose,
						"cp",
						`${options.service}:${reportPath}`,
						context.reportPath,
					],
				},
			};
		},
	};
}

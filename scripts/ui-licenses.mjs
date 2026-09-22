import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Metro source maps identify the packages actually included in the static UI.
// Generate notices from their installed license files, then discard the maps.
export async function writeUiLicenses(app, output) {
	const maps = (await readdir(output, { recursive: true })).filter((file) =>
		file.endsWith(".js.map"),
	);
	if (!maps.length) throw new Error("UI license generation requires Metro source maps.");
	const packages = new Set();
	for (const file of maps) {
		const map = JSON.parse(await readFile(join(output, file), "utf8"));
		for (const source of map.sources) {
			const root = source.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1];
			if (root) packages.add(resolve(app, root.replace(/^\//, "")));
		}
	}
	const notices = [];
	for (const root of [...packages].sort()) {
		const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
		const entries = await readdir(root, { withFileTypes: true });
		let files = entries
			.filter(
				(entry) => entry.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(entry.name),
			)
			.map((entry) => join(root, entry.name))
			.sort();
		// These React Native subpackages omit the monorepo's shared MIT license.
		if (
			!files.length &&
			["@react-native/js-polyfills", "@react-native/normalize-colors"].includes(manifest.name)
		)
			files = [resolve(app, "../node_modules/react-native/LICENSE")];
		if (!files.length) throw new Error(`Missing bundled license: ${manifest.name}`);
		const licenses = await Promise.all(files.map((file) => readFile(file, "utf8")));
		notices.push(
			`${manifest.name}@${manifest.version} (${manifest.license})\n\n${licenses.join("\n")}`,
		);
	}
	if (!notices.length) throw new Error("No bundled UI licenses were found.");
	await writeFile(
		join(output, "THIRD_PARTY_NOTICES.txt"),
		"Third-party software included in the Test Studio UI.\nEach component remains under its original license.\n\n" +
			notices.join("\n----------------------------------------\n\n"),
	);
	for (const file of maps) {
		const bundle = join(output, file.slice(0, -4));
		const source = await readFile(bundle, "utf8");
		await writeFile(
			bundle,
			source.replace(/\n?\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n)?$/, ""),
		);
		await rm(join(output, file));
	}
}

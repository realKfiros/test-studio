import { resolve } from "node:path";

// A local adapter example. Save Node test files as *.check.mjs.
// No Test Studio imports are needed to load this through npx.
export default {
	id: "node-checks",
	label: "Node checks",
	executable: "node",
	match: (path) => path.endsWith(".check.mjs"),
	discover: () => ({ note: "Runs this file with the Node.js test runner." }),
	command({ root, file, reportPath }) {
		return {
			executable: "node",
			cwd: resolve(root, file.cwd),
			args: [
				"--test",
				"--test-reporter=junit",
				`--test-reporter-destination=${reportPath}`,
				resolve(root, file.path),
			],
		};
	},
	// The default result parser reads JUnit, so parseResults is unnecessary here.
};

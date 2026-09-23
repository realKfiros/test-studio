// No SDK import needed: local modules can export a command definition.
export default {
	id: "node-checks",
	label: "Node checks",
	files: ["**/*.check.mjs"],
	executable: "node",
	args: ["--test", "--test-reporter=junit", "--test-reporter-destination={report}", "{file}"],
};

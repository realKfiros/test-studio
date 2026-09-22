export type TestCase = {
	id: string;
	name: string;
	fullName: string;
	line: number;
	mode: string;
	runnable: boolean;
};
export type TestFile = {
	id: string;
	path: string;
	runner: string;
	workspace: string;
	cwd: string;
	name: string;
	cases: TestCase[];
	platform?: string;
	appId?: string;
	tags?: string[];
	steps?: {
		name: string;
		line: number;
	}[];
	note?: string;
};
export type Catalog = {
	root: string;
	name: string;
	scannedAt: string;
	files: TestFile[];
	libraries: string[];
	warnings: string[];
	runners: {
		id: string;
		label: string;
		executable: string;
		supportsIndividualTests: boolean;
		available: boolean;
		path: string | null;
	}[];
};
export type Selection = {
	fileId: string;
	caseIds?: string[];
};
export type RunOptions = {
	device?: string;
	env?: Record<string, string>;
};
export type Status = "queued" | "running" | "passed" | "failed" | "cancelled";
export type Result = {
	name: string;
	status: "passed" | "failed" | "skipped";
	duration: number;
	message?: string;
};
export type Job = {
	id: string;
	file: TestFile;
	selection: Selection;
	status: Status;
	command: string;
	output: string;
	results: Result[];
	startedAt?: number;
	finishedAt?: number;
	exitCode?: number | null;
};
export type Run = {
	id: string;
	status: Status;
	startedAt: number;
	finishedAt?: number;
	jobs: Job[];
	artifactDir: string;
};

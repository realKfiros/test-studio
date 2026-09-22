# Test Studio

A local test explorer for Bun tests and Maestro flows. It discovers files and test declarations directly from source, so adding a test does not require another package.json script.

This is an unpublished, private prototype in its own repository. Test Studio scans a project you choose; it does not add scripts or dependencies to that project.

## Start

Install dependencies in this repository, then choose a project to scan:

```sh
bun install
bun run start /absolute/path/to/project
```

To explore Test Studio’s own tests, run `bun run start .`.

Open **http://127.0.0.1:4310**. Use Ctrl+C in the terminal to stop the server and its active test process.

To scan another project or use a different port:

```sh
bun run start /absolute/path/to/project --port 4311
```

Requires Bun 1.3+; install Maestro separately for mobile flows. Both executables must be on PATH. The project being tested needs its own dependencies installed. Dependencies for Test Studio are installed locally in this repository and pinned in `bun.lock`.

You can launch from any directory using the absolute path to `server.ts`. When no project path is supplied, the current working directory is scanned.

## Use

- Filter by runner, workspace, platform, filename, test name, or flow tag. `/` focuses search.
- Select files with their checkboxes, or select individual Bun tests in the inspector. `Run selected` queues the selection. The number on the button counts files, including partially selected files.
- Use the play button beside a Bun test to run that test immediately. `Run file` runs the entire file. Hooks still run as usual.
- Inspect Maestro steps and source, then `Run flow`. Maestro steps are sequential and cannot be run independently.
- Open `Run settings` to supply a device ID or Maestro `NAME=value` variables. iOS/Android filters narrow the catalog; the device ID chooses the actual device.
- Inspect live stdout/stderr, per-test results, elapsed time, and exit codes. Stop cancels the active process group and queued files. `Rerun failed` reruns failed files with their original test selections.
- `Runs` and the sidebar show the last 20 runs in the current server session. Reruns use the current device/variable settings. Settings are not saved across page reloads.

Discovery refreshes every five seconds, including additions, edits, and deletions. It never imports test files. Tests execute only when you start a run. Execution is serial with a fresh process per file, keeping module mocks isolated across files. Output is polled while running; structured JUnit results arrive when each file finishes.

## Discovery rules

- Test files: `.test`, `.spec`, `_test`, `_spec` with JS/TS module extensions, plus JS/TS files in `__tests__` directories.
- Bun: explicit `bun:test` imports (including named aliases and namespace imports), or a Bun test script in the nearest package manifest for global-style tests.
- Vitest, Jest, Node test, and Playwright imports are identified, and relevant package dependencies are listed. **Only Bun and Maestro have execution adapters in this version.** Other runners are shown without run controls.
- Maestro: YAML with an `appId` configuration document followed by a command sequence, including files inside `.maestro`. Names, tags, source lines, top-level steps, and filename-based iOS/Android hints are discovered.
- Static nested suite names are combined into anchored, escaped Bun name filters. Parameterized tests, computed names, declarations inside helper callbacks/loops, and duplicate names are inspectable but require file-level runs. Runtime-generated test counts may differ from declaration counts.
- Existing `bunfig.toml` is respected by running from the nearest config directory, otherwise from the scan root. Maestro runs from the nearest package directory. Arbitrary package.json shell scripts are never executed. Script-only setup/preload flags need to live in native runner configuration or the environment.
- In Git repositories, tracked and untracked non-ignored files are scanned. Generated files excluded by `.gitignore` are skipped. Outside Git, filesystem discovery is used.
- Dependencies, build outputs, coverage, native build folders (`ios`, `android`, `Pods`), hidden directories other than `.maestro`, symlinks, and nested Git checkouts are skipped. Individual files larger than 2 MB are skipped.

Optional project-root configuration can exclude additional paths without listing tests:

```json
{
	"exclude": ["experiments/**", "fixtures/**"]
}
```

Save as `test-studio.config.json`. Patterns are relative Bun globs. Conventional Bun and Maestro layouts need no configuration.

## Project environment

Tests inherit the shell environment and native runner configuration. Start any services or emulators required by the project before running its tests. Maestro requires a running simulator/device and the app targeted by the flow; Expo flows may also need Metro. Test Studio does not boot devices, start servers, seed data, or infer arbitrary setup commands. Follow the target project’s test setup instructions.

## Boundaries and artifacts

The server binds only to `127.0.0.1`, rejects unexpected hosts/origins, and requires a per-server session token for API access. It serves only discovered test sources. Processes receive argument arrays rather than shell commands. This is a tool for running **trusted local repositories**: tests and their hooks have the same privileges as a terminal run.

JUnit reports and Maestro debug files go into a unique OS temporary directory for each run; the UI shows the path. History survives a browser refresh, but not a server restart. Pruning old runs deletes only their own temporary artifact directories. Retained run artifacts remain in the OS temp directory after shutdown. Output retains the last 100,000 characters per job; full JUnit reports remain on disk. Variables are redacted in command previews, but a test/runner can still print values into its own logs. Each job has a 30-minute limit. macOS/Linux process-group cancellation is supported; Windows process-tree cancellation has not been verified.

## Formatting and verification

```sh
bun run format
bun run lint:fix
```

Prettier uses tabs with a four-column width, double quotes, semicolons, LF line endings, and a 100-column print width. ESLint applies the recommended JavaScript and TypeScript rules, with browser, Node.js, and Bun globals for the appropriate files.

Run the checks before submitting changes:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
```

The integration suite launches real Bun processes against temporary projects and a local HTTP server. It verifies discovery, ignore rules, filtering, failures, zero-result runs, cancellation, queue exclusivity, report parsing, and the local API boundary.

## Extending

`discovery.ts` creates the catalog, `adapters.ts` defines execution commands and report normalization, `runner.ts` owns the queue/process lifecycle, and `server.ts` serves the API and plain HTML/CSS/JS UI. There is no frontend build step. Add an adapter and a detector to support another runner.

Before an open-source release: choose a name/license, add packaging and CI, test Windows, expand discovery coverage for framework-specific syntax/configuration, and decide on persistent history and device enumeration. Nothing is published by this prototype.

Runner references: [Bun reporting](https://bun.sh/docs/test/reporters), [Bun test filtering](https://bun.sh/docs/test), [Maestro CLI options](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options).

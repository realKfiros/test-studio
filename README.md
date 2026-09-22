# Test Studio

A local test explorer with pluggable adapters. It discovers files and test declarations directly from source, so adding a test does not require another package.json script. Bun tests and Maestro flows are supported out of the box.

Run this checkout with **Bun 1.3+**. Install Maestro for Maestro flows. Target projects need their own dependencies installed.

## Start from this checkout

```sh
bun install
bun run start /absolute/path/to/project
```

Run `bun run start .` to explore this repository. With no path argument, Test Studio scans the current directory. Open the printed local URL; Ctrl+C stops the server and active test process.

```sh
bun run start /absolute/path/to/project --port 4311
bun run start /absolute/path/to/project --config config/studio.json
bun run start init /absolute/path/to/project
```

`init` creates `test-studio.config.json` and `.teststudioignore`, preserving existing files. It never modifies package.json.

## Use

- Filter by runner, workspace, platform, filename, test name, or flow tag. `/` focuses search.
- Select files with their checkboxes, or select individual Bun tests in the inspector. `Run selected` queues the selection. The number on the button counts files, including partially selected files.
- Use the play button beside an individually selectable test to run it immediately. `Run file` runs the entire file. Hooks still run as usual.
- Inspect Maestro steps and source, then `Run flow`. Maestro steps are sequential and cannot be run independently.
- Open `Run settings` to supply a device ID or Maestro `NAME=value` variables. iOS/Android filters narrow the catalog; the device ID chooses the actual device.
- Inspect live stdout/stderr, per-test results, elapsed time, and exit codes. Stop cancels the active process group and queued files. `Rerun failed` reruns failed files with their original test selections.
- `Runs` and the sidebar show the last 20 runs in the current server session. Reruns use the current device/variable settings. Settings are not saved across page reloads.

Discovery refreshes every five seconds, including additions, edits, and deletions. Built-in discovery never imports test files; custom adapters should follow the same rule. Tests execute only when you start a run. Execution is serial with a fresh process per file, keeping module mocks isolated across files. Output is polled while running; structured JUnit results arrive when each file finishes.

## Discovery rules

- Test files: `.test`, `.spec`, `_test`, `_spec` with JS/TS module extensions, plus JS/TS files in `__tests__` directories.
- Bun: explicit `bun:test` imports (including named aliases and namespace imports), or a Bun test script in the nearest package manifest for global-style tests.
- Vitest, Jest, Node test, and Playwright imports are identified, and relevant package dependencies are listed. Bun and Maestro have built-in execution adapters. Other runners are shown without run controls unless a matching custom adapter is enabled.
- Maestro: YAML with an `appId` configuration document followed by a command sequence, including files inside `.maestro`. Names, tags, source lines, top-level steps, and filename-based iOS/Android hints are discovered.
- Static nested suite names are combined into anchored, escaped Bun name filters. Parameterized tests, computed names, declarations inside helper callbacks/loops, and duplicate names are inspectable but require file-level runs. Runtime-generated test counts may differ from declaration counts.
- Existing `bunfig.toml` is respected by running from the nearest config directory, otherwise from the scan root. Maestro runs from the nearest package directory. Arbitrary package.json shell scripts are never executed. Script-only setup/preload flags need to live in native runner configuration or the environment.
- In Git repositories, tracked and untracked non-ignored files are scanned. Generated files excluded by `.gitignore` are skipped. Outside Git, filesystem discovery is used.
- Dependencies, build outputs, coverage, generated native folders (`Pods`, `DerivedData`), editor metadata, symlinks, and nested Git checkouts are skipped. Candidate files larger than 2 MB are skipped.

## Configuration

Place one `test-studio.config.json`, `.ts`, `.mts`, `.cts`, `.js`, `.mjs`, or `.cjs` file at the project root. JavaScript/TypeScript files export a configuration object; CommonJS can use `module.exports`. Multiple config files require an explicit `--config` selection. That path is relative to the project root. Invalid options stop startup with an actionable error.

```json
{
	"name": "My project",
	"port": 4310,
	"adapters": ["bun", "maestro", "./tools/custom-adapter.mjs"],
	"exclude": ["fixtures/generated/"],
	"ignoreFile": ".teststudioignore",
	"respectGitignore": true,
	"timeoutMs": 1800000
}
```

All options are optional. The default adapters are `["bun", "maestro"]`; supplying `adapters` replaces that list, and an empty list disables execution adapters. Use a module path or an installed package name for an external adapter. Factory exports receive options from entries such as `{ "use": "test-studio-adapter-example", "options": { "project": "web" } }`. Modules are resolved from the config directory, including plugins installed in the target project.

`--port` overrides config; port `0` picks a free port. Restart Test Studio after changing configuration or adapter code. The ignore file is reread on each scan. A custom `ignoreFile` path is relative to the project root and must exist; `false` disables it. `name` overrides the project name in the UI, and `timeoutMs` sets each job's time limit.

Configs export plain objects. The [JSON schema](schema.json) documents every configuration option.

## Ignore rules

`.teststudioignore` and `exclude` use Git ignore syntax: comments, directory patterns, leading `/` for root anchoring, `**`, and `!` exceptions. Patterns are relative to the project root. Config exclusions are applied first, followed by ignore-file rules.

```gitignore
# Generated test copies
fixtures/generated/

# Keep one file in an otherwise filtered directory
experiments/*.test.ts
!experiments/smoke.test.ts
```

An ignored directory cannot be re-included by an exception for a file inside it; keep the parent directory traversable when using exceptions. Existing `.gitignore` rules are respected by default, including nested files outside Git repositories. In Git repositories, tracked files remain discoverable even if a Git ignore rule matches them. Test Studio exclusions also apply to tracked files. Use `respectGitignore: false` to scan Git-ignored files; dependencies, build outputs, symlinks, and nested repositories remain excluded.

Hidden source directories and native source folders are available to adapters. Add project-specific exclusions to `.teststudioignore` when needed.

## Project environment

Tests inherit the shell environment and native runner configuration. Start any services or emulators required by the project before running its tests. Maestro requires a running simulator/device and the app targeted by the flow; Expo flows may also need Metro. Test Studio does not boot devices, start servers, seed data, or infer arbitrary setup commands. Follow the target project’s test setup instructions.

## Boundaries and artifacts

The server binds only to `127.0.0.1`, rejects unexpected hosts/origins, and requires a per-server session token for API access. It serves only discovered test sources. Processes receive argument arrays rather than shell commands. This is a tool for running **trusted local repositories**: tests, configuration modules, adapters, and their hooks have the same privileges as a terminal run.

JUnit reports and Maestro debug files go into a unique OS temporary directory for each run; the UI shows the path. History survives a browser refresh, but not a server restart. Pruning old runs deletes only their own temporary artifact directories. Retained run artifacts remain in the OS temp directory after shutdown. Output retains the last 100,000 characters per job; full JUnit reports remain on disk. Variables are redacted in command previews, but a test/runner can still print values into its own logs. Each job defaults to a 30-minute limit, configurable with `timeoutMs`. macOS/Linux process-group cancellation is supported; Windows process-tree cancellation has not been verified.

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

The integration suite launches real processes against temporary projects and a local HTTP server. It covers built-in and custom adapters, config loading, ignore rules, filtering, failures, zero-result runs, cancellation, timeouts, queue exclusivity, report parsing, and the local API boundary.

## Extending

The [adapter interface](adapter.ts) defines discovery, command construction, and optional result parsing. Export an adapter object or factory from a local module and register it in your project config. Runner metadata automatically supplies its UI controls.

The CLI loads project config and adapters; discovery walks the project once and asks adapters to inspect candidate files. The runner owns process lifecycle, cancellation, timeouts, and history. Adapters supply literal commands and normalized results, with JUnit as the default report format. The UI is plain HTML/CSS/JS and reads runner metadata from the catalog.

Before release: add executable packaging, choose a registry name and license, add CI, and verify Windows process cancellation. This checkout remains private and unpublished.

Runner references: [Bun reporting](https://bun.sh/docs/test/reporters), [Bun test filtering](https://bun.sh/docs/test), [Maestro CLI options](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options). Configuration modules use [jiti](https://github.com/unjs/jiti) and ignore files use [node-ignore](https://github.com/kaelzhang/node-ignore).

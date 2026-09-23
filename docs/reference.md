# Usage reference

[Back to the README](../README.md) · [Writing adapters](adapters.md)

Detailed behavior for discovery, selection, configuration, and test execution.

## Terminal options and exit codes

`--no-ui` is an alias for `run`. The project defaults to the current directory. `--config` works in both modes; `--port` is only for the UI.

| Option             | Selection                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--runner ID`      | Enabled adapter ID; repeat to include multiple adapters.                                                                                                |
| `--file PATH`      | Exact file or directory inside the project; repeat to include multiple paths. Relative paths resolve from the project root. These are paths, not globs. |
| `--test TEXT`      | Case-sensitive literal substring of the full static test name, including suite names. Requires an adapter with individual test selection.               |
| `--device ID`      | Device identifier passed to the adapter.                                                                                                                |
| `--env NAME=value` | Flow variable; repeat for multiple variables. Values containing spaces or shell punctuation should be quoted.                                           |

Filters combine: a test must match the selected adapters, paths, and name. Name filters never silently broaden into whole-file runs; generated, duplicate, skipped, or otherwise unselectable cases require a file-level run. Maestro steps cannot be selected independently.

Without explicit file/name selection, discovered files without an enabled adapter are reported as `SKIP` and excluded. Explicitly selecting an unsupported file is an error. Missing executables, empty selections, unmatched file paths, and discovery errors fail before tests start. Discovery errors are treated strictly in terminal mode so an incomplete scan cannot produce a successful CI result.

Output streams live, followed by per-file and per-test results, totals, duration, and the report directory. Full streamed output can be redirected to a file; the runner still retains only the latest 100,000 characters per job for adapter result parsing. Reports remain in the printed temporary directory.

Exit codes are `0` for a passing run, `1` for failures/timeouts/setup or selection errors, `130` after Ctrl+C, and `143` after SIGTERM. Cancellation stops the active process group and cancels queued files before exiting.

## Browser folders and filters

The explorer mirrors test file paths as collapsible folders. Folder checkboxes select/deselect visible runnable descendants, including nested folders. A mixed checkbox means only some files or individual cases are selected. Folder play buttons run those visible descendants as whole files. Unsupported files remain inspectable and are excluded from folder actions.

Runner, workspace, platform, tag, latest result, and search filters combine. Search matches paths, test names, and tags. **Reset filters** clears them all. Folder actions and **Select visible** follow the filters; selections hidden by filters remain selected until explicitly cleared. **Run selected** includes those hidden selections.

Latest result means the most recent run containing a file in this server session. **Not run** means no retained run includes it; restarting the server or pruning history resets that information. Results from individual test runs describe that selection, not every test in the file. **Expand all** and **Collapse all** affect the current folder tree.

## Discovery rules

- Test files: `.test`, `.spec`, `_test`, `_spec` with JS/TS module extensions, plus JS/TS files in `__tests__` directories.
- Bun: explicit `bun:test` imports (including named aliases and namespace imports), or a Bun test script in the nearest package manifest for global-style tests.
- Vitest, Jest, Node test, and Playwright imports are identified, and relevant package dependencies are listed. Bun and Maestro are enabled by default; Pest has an opt-in built-in adapter. Other runners are shown without run controls unless a matching custom adapter is enabled.
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

All options are optional. The default adapters are `["bun", "maestro"]`; supplying `adapters` replaces that list, and an empty list disables execution adapters. Add `"pest"` for PHP tests. Command adapters can be declared inline with `id`, `files`, `executable`, and `args`; see [Writing adapters](adapters.md) for placeholders, Pest options, and Docker Compose support. Use a module path or an installed package name for an external adapter. Factory exports receive options from entries such as `{ "use": "test-studio-adapter-example", "options": { "project": "web" } }`. Modules are resolved from the config directory, so plugins installed in the target project work when the CLI is launched with npx.

`--port` overrides config; port `0` picks a free port. Restart Test Studio after changing configuration or adapter code. The ignore file is reread on each scan. A custom `ignoreFile` path is relative to the project root and must exist; `false` disables it. `name` overrides the project name in the UI, and `timeoutMs` sets each job's time limit.

The SDK exports `defineConfig`, `defineAdapter`, `defineCommandAdapter`, `createPestAdapter`, `withDockerCompose`, and their types from `@kfiros/test-studio` for editor assistance. Configs can also export plain objects without importing Test Studio. The [JSON schema](../schema.json) can be referenced locally as `./node_modules/@kfiros/test-studio/schema.json` when the package is installed.

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

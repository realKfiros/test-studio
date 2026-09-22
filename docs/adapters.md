# Writing adapters

An adapter supplies discovery, command construction, and optional result parsing. The same interface is used by the built-in Bun and Maestro adapters and external packages. Adding an adapter requires no frontend or server changes.

## Register an adapter

```json
{
	"adapters": ["bun", "maestro", "./tools/my-adapter.mjs"]
}
```

Paths are relative to the configuration file. Bare package names resolve from that directory's dependencies, including when Test Studio itself runs through npx. Install third-party adapters in the project before referencing them. Adapter modules may be JavaScript, TypeScript, ESM, or CommonJS. They export an adapter object or a factory receiving the entry's `options`:

```js
export default (options) => ({
	// Adapter properties and methods...
});
```

```json
{
	"adapters": [
		"bun",
		"maestro",
		{ "use": "test-studio-adapter-example", "options": { "project": "web" } }
	]
}
```

Providing `adapters` replaces the default list. IDs must be unique, start with a lowercase letter, and contain lowercase letters, digits, or hyphens. `all` is reserved by the UI. The first adapter whose discovery returns a file claims that file, so order matters when matchers overlap. Restart Test Studio after changing adapter configuration or code.

## Runnable example

Copy [node-checks.mjs](../examples/node-checks.mjs) into `tools/` and register it. It finds `*.check.mjs` files and runs the Node.js test runner with a [JUnit reporter](https://nodejs.org/download/release/v22.17.0/docs/api/test.html#test-reporters). For example:

```js
// example.check.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

test("adds numbers", () => {
	assert.equal(1 + 1, 2);
});
```

The example uses plain objects, so the project does not need to import or install the SDK merely to load its adapter. For typed adapter development with Test Studio installed, use `defineAdapter` and `Adapter` from `@kfiros/test-studio`.

## Interface

| Member                    | Purpose                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`, `label`             | Stable framework identifier and UI label.                                                                    |
| `executable`              | Tool checked for availability in project-local `.bin` directories and PATH.                                  |
| `supportsIndividualTests` | Enables individual case controls; defaults to false.                                                         |
| `match(path)`             | Cheap synchronous candidate check on a project-relative path with forward slashes.                           |
| `discover(context)`       | Inspect source and return file metadata, or null if it is not this framework. May be async.                  |
| `command(context)`        | Synchronously return `{ executable, args, cwd, env? }`. Never use a shell command string.                    |
| `parseResults(context)`   | Optionally return normalized results, asynchronously if needed. Defaults to reading JUnit from `reportPath`. |

`discover` receives `root` (absolute), `path` (project relative), source text, the nearest package's manifest and workspace, and `nearestConfig(filename)`. That helper returns the project-relative nearest directory containing a configuration file, or `.`. Discovery must read source without executing tests or hooks. It returns optional `name`, `cwd`, `cases`, `steps`, `tags`, `platform`, `appId`, and `note`. The scanner owns file IDs, paths, and the adapter ID. `cwd` defaults to the nearest package directory and is relative to the project root. Detection exceptions appear as catalog warnings.

Each case has `id`, `name`, `fullName`, `line` (one-based), `mode`, and `runnable`. IDs must be unique within the file and change when the declaration changes. Set `runnable: false` for computed, duplicate, skipped, or otherwise unreliable names. File-level runs remain possible without cases.

`command` receives the absolute root, discovered file, selection (`fileId`, optional `caseIds`), a unique absolute `reportPath`, and run options. It is called once for validation and again when execution begins, so keep it free of side effects. Return literal argument arrays and an absolute working directory. Environment overrides merge with the launching shell; command environment values are not included in previews. The queue validates selections before starting any job and resolves local executables before spawning. Current run options contain `device` and `env` for flows; factories can close over additional framework-specific config.

`parseResults` receives the file, report path, captured output, and process exit code. Return `{ name, status, duration, message? }[]`, where status is `passed`, `failed`, or `skipped`, and duration is a nonnegative number in milliseconds. Output is capped at 100,000 characters, so use report files for larger results. Exported `parseJUnitReport(xml)` can be reused by adapters with different report locations.

A job passes only when its process exits zero, it produces results, and none fail. No results, malformed results, a nonzero exit code, or a timeout fail the job. A selected-case run also needs at least one non-skipped result. The queue owns cancellation, timeout enforcement, process output, temporary artifact directories, and serial execution; adapters should not implement those again.

## Publishing an adapter

Export the adapter object or factory as the package's default export. Compile TypeScript or publish source supported by the loader. Declare actual runtime dependencies in your package. If you import Test Studio helpers at runtime, declare a compatible peer dependency; TypeScript-only imports are erased and do not require runtime SDK imports. An installed adapter can be registered by its package name with no registration code in Test Studio.

Adapters and executable configuration are trusted local code and run with the user's privileges, just like the tests they launch.

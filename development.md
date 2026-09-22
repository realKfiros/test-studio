# Developing Test Studio

This guide is for improving the UI, CLI, discovery, runners, or packaging. For using the published package, start with the [README](README.md). For adding a framework without changing Test Studio itself, see [Writing adapters](docs/adapters.md).

## Set up the checkout

Use Node.js 24.3+ and Bun. The published CLI supports Node.js 22+, but the Expo development toolchain has stricter version requirements. You only need Maestro and a simulator/device when exercising Maestro flows.

```sh
git clone https://github.com/realKfiros/test-studio.git
cd test-studio
bun install --frozen-lockfile
```

Install dependencies at the repository root. The small `ui/package.json` defines Expo's entry point; UI dependencies live in the root package.json.

## Start the UI locally

Run against this repository's own tests:

```sh
bun run dev .
```

Or point it at a project with the test files you want to work with:

```sh
bun run dev /absolute/path/to/project --port 4311
```

Open the URL printed in the terminal. `dev` exports the Expo web app, then starts the TypeScript CLI with Bun. The scan target defaults to your current directory. Ctrl+C stops the server and the active test process.

**The current development command does not hot-reload.** After editing the UI, stop the command, run it again, and reload the browser. After changing CLI/server code, restart the process. Test-file edits in the target project are rediscovered automatically.

For a faster server-only iteration after the UI has already been exported:

```sh
bun cli.ts /absolute/path/to/project --port 4311
```

Always open the UI through the CLI's local URL. The CLI injects the session token and serves the API on the same origin; opening `ui/dist/index.html` directly does not provide that integration.

## Working on the UI

The UI is an Expo web app built with React Native, `styled-components/native`, and MobX. It lives in `ui/` and is exported to static HTML and JavaScript for distribution.

| Location                                 | What to change here                                               |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `ui/App.tsx`                             | Screen composition, responsive panes, store connection lifecycle  |
| `ui/components/`                         | Catalog, inspectors, run history, settings, and reusable controls |
| `ui/theme.ts`                            | Shared colors and typography tokens                               |
| `ui/styles/`                             | Styles reused by multiple components                              |
| `ui/stores/studioStore.ts`               | Observable state, computed values, polling, and actions           |
| `ui/stores/poll.ts`                      | Abortable polling and disposal                                    |
| `ui/model.ts`                            | Pure filtering and selection helpers                              |
| `ui/api.ts`                              | Requests to the local API                                         |
| `ui/session.web.ts`, `ui/hooks/*.web.ts` | Browser-specific integration                                      |

### Components and styles

- Use React Native primitives such as `View`, `Text`, `Pressable`, `ScrollView`, and `TextInput`.
- Import styled-components from `styled-components/native`.
- Declare a component's private styled components **in the same file, above its function**. Put styles in `ui/styles/` only when multiple files share them.
- Use theme tokens for colors and fonts, and existing controls such as `Button`, `Checkbox`, `Select`, and `Icon`.
- Import Lucide icons from their individual public paths, such as `lucide-react-native/icons/play`, to keep unused icons out of the Metro bundle.
- Keep direct browser APIs in `.web.ts` files with a platform fallback when needed.

For example:

```tsx
import { observer } from "mobx-react-lite";
import styled from "styled-components/native";
import studioStore from "../stores";

const Count = styled.Text`
	color: ${({ theme }) => theme.colors.muted};
	font-family: ${({ theme }) => theme.fonts.body};
`;

export const FileCount = observer(function FileCount() {
	return <Count>{studioStore.files.length} files</Count>;
});
```

### State and async work

Components read the shared store through `observer` and call store actions. Keep catalog, filters, selections, runs, settings, and source loading in `StudioStore`; component-local state is appropriate for transient presentation details such as an open menu.

The store receives a request function, so its behavior can be tested without a browser. API snapshots use reference observability; preserve the replacement-based updates. `connect()` owns polling and reactions, and `disconnect()` disposes them. New asynchronous work must handle cancellation and stale responses when the user switches files, changes runs, or leaves the screen.

Keep data transformations in `ui/model.ts` when they do not need observable state. Avoid starting polling or duplicating store state inside individual components.

### Check UI changes in the browser

Exercise the affected flow with real discovered files. For broad layout changes, check:

- Desktop panes and a narrow window, including overflowing paths and test names.
- Workspace/runner filters, search, file selection, and partial test selection.
- Tests/flow steps and source tabs.
- A completed run, output scrolling, results, and history.
- Settings, disabled controls, keyboard focus, and accessible names for icon buttons.

Use sample projects for screenshots, with no private paths, credentials, or customer data. The README images live in `docs/images/`. Capture the running UI, update image alt text when the scene changes, and keep the images readable at README width.

## Working on the CLI and adapters

| Location                              | Responsibility                                                     |
| ------------------------------------- | ------------------------------------------------------------------ |
| `cli.ts`                              | Arguments, help, version, initialization, UI/headless entry points |
| `config.ts`                           | Project config, ignore settings, adapter module loading            |
| `discovery.ts`, `detectors.ts`        | File traversal and static test discovery                           |
| `adapter.ts`, `adapters/`             | Adapter contract and built-in Bun/Maestro adapters                 |
| `runner.ts`, `reports.ts`             | Process queue, cancellation, timeouts, and results                 |
| `terminal.ts`                         | Headless selection, streamed output, and exit codes                |
| `server.ts`, `web-assets.ts`          | Local API, session checks, and static asset serving                |
| `index.ts`, `types.ts`, `schema.json` | Public SDK, shared types, and config schema                        |

Discovery must not execute test source. Adapters return literal executable/argument arrays; the runner owns process lifecycle and report storage. Preserve selection boundaries when files change, and keep config/schema/types aligned when introducing options.

To exercise the terminal directly:

```sh
bun cli.ts run /absolute/path/to/project --runner bun
bun cli.ts run /absolute/path/to/project --file tests/example.test.ts --test "creates a user"
```

The CLI runs on Node after compilation. Do not introduce Bun-only APIs into runtime modules just because the development command and tests run under Bun.

## Build the distributable

```sh
npm run build
npm start -- /absolute/path/to/project
```

The build compiles the executable and TypeScript declarations, exports the Expo UI, and copies it into `dist/web/`. The installed package serves those files directly. Expo, React, React Native, MobX, styled-components, and icon libraries remain development dependencies.

`npm run build:ui` exports only the frontend to `ui/dist/`. Source maps identify bundled dependency licenses during the build, then are removed. The bundle includes `THIRD_PARTY_NOTICES.txt`. Do not edit generated files in `dist/` or `ui/dist/`.

## Formatting and verification

```sh
npm run format
npm run lint:fix
```

Prettier uses tabs, double quotes, semicolons, LF endings, and a 100-column print width. ESLint also enforces React hooks and React Native UI imports/components.

Choose checks that cover the change:

| Change                          | Useful checks                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Documentation                   | `npm run format:check`; check links, screenshots, and command examples            |
| UI presentation                 | `npm run lint`, `npm run typecheck`, `npm run build:ui`, browser checks           |
| UI state or selection           | `bun test ./tests/studio-store.test.ts ./tests/ui-model.test.ts`                  |
| Discovery, adapters, or API     | `npm run build:ui`, then `bun test ./tests/studio.test.ts ./tests/config.test.ts` |
| Terminal behavior               | `bun test ./tests/terminal.test.ts`                                               |
| Dependencies, SDK, or packaging | `npm run test:package`                                                            |

Run the complete verification before a release or a broad change:

```sh
npm run verify
```

This runs formatting, lint, both TypeScript projects, the package smoke test, and the full Bun suite. The package check requires npm and Bun/bunx, and may download dependencies. It builds, packs, and launches the artifact through both npx and bunx in temporary projects, then checks SDK imports, adapter execution, exit codes, and compiled UI assets.

Tests live in `tests/` and use temporary projects and real subprocesses where needed. Add regression coverage for changed behavior, especially discovery, selection, cancellation, and asynchronous state; visual-only changes need browser verification rather than tests that just repeat style values.

## Sending a change

Keep the change focused, describe its user-visible effect, and list the checks you ran. Include before/after screenshots for UI work. Update the README or usage reference when behavior changes, and the adapter guide when the public contract changes.

GitHub Actions runs the complete verification on pushes to `master` and pull requests. For packaging and publication, follow [Publishing releases](docs/releases.md). Pushing a matching version tag triggers the npm release workflow; builds and tests alone do not publish anything.

# Publishing releases

The package ships the compiled Node executable, TypeScript declarations, static UI, configuration schema, adapter documentation, and bundled UI license notices. Source maps are used during the build to identify bundled dependencies and are removed from the published artifact. Consumers do not build the frontend or install its development dependencies.

## First release

The package is `@kfiros/test-studio`, licensed under MIT. Sign in to an npm account with permission to publish under the `@kfiros` scope. The GitHub repository and npm package have independent visibility settings.

From this checkout, with Node.js 22+ and Bun installed:

```sh
bun install --frozen-lockfile
npm run verify
npm pack --dry-run
npm login --registry=https://registry.npmjs.org
npm publish
```

`verify` checks formatting, lint, both TypeScript projects, the integration tests, and the packed artifact. The package check launches the tarball through both npx and bunx in an isolated project, checks SDK imports, executes an adapter, and verifies the compiled UI. Temporary packages and test reports are cleaned up afterward.

`npm publish` repeats verification through `prepublishOnly` and builds the executable and UI through `prepack`. `publishConfig` targets the public npm registry with public access. Complete npm's authentication or two-factor challenge when prompted. Nothing publishes on a build, test, or commit.

To inspect the upload without publishing:

```sh
npm publish --dry-run
```

## Later releases

Choose the next semantic version and update the lockfile:

```sh
npm version patch --no-git-tag-version
bun install --lockfile-only
```

Use `minor` or `major` when appropriate. Review and commit the release changes, then run `npm publish`. A published name/version pair cannot be reused.

npm scans newly published versions before making them installable. A successful publish can therefore be followed by temporary 404 responses from `npm view`, npx, or bunx. Allow a few minutes and retry the installation check; do not publish again just because the version is still unavailable. `npm dist-tag ls @kfiros/test-studio` remains available during scanning. See [npm’s publish-time scanning guidance](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).

After publication, verify the released version from outside this checkout:

```sh
npx @kfiros/test-studio@0.1.0 --version
bunx @kfiros/test-studio@0.1.0 --version
```

Replace `0.1.0` with the version being released.

Publishing behavior follows the [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish/). Bun's [bunx documentation](https://bun.sh/docs/pm/bunx) describes executable resolution and its default use of the Node shebang.

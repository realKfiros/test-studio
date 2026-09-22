# Publishing releases

The package is `@kfiros/test-studio`, licensed under MIT. It ships the compiled Node executable, TypeScript declarations, static UI, configuration schema, documentation, examples, and bundled UI license notices. Consumers do not build the frontend or install its development dependencies.

## GitHub Actions

Two workflows handle verification and publication:

- [CI](../.github/workflows/ci.yml) runs on pushes to `master` and pull requests. It checks formatting, lint, both TypeScript projects, the packed executable through npx and bunx, and the full Bun suite.
- [Publish to npm](../.github/workflows/publish.yml) runs when a `v*` tag is pushed. It checks that the tag matches a stable version in `package.json` and points to a commit on `master`, then installs locked dependencies, runs the complete verification, and publishes the verified build.

Both use Node.js 24.14.1 and Bun 1.3.11. Actions are pinned to release commits. Release jobs run serially and are not cancelled by newer tags. Ordinary commits do not publish a new npm version.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with GitHub's OIDC identity. No npm token secret is needed. The workflow uses `npm publish --ignore-scripts` because `npm run verify` has already built and tested the package; this keeps publication on the verified build.

## Release a version

Start on `master` with a clean checkout and pull the latest changes. Choose the next semantic version:

```sh
npm version patch --no-git-tag-version
bun install --lockfile-only
```

Use `minor` or `major` when appropriate. Inspect the changes, then commit and push the matching version tag. For example, for `0.1.2`:

```sh
git add package.json bun.lock
git commit -m "chore: release 0.1.2"
git tag v0.1.2
git push --atomic origin master v0.1.2
```

Follow the [Publish to npm workflow](https://github.com/realKfiros/test-studio/actions/workflows/publish.yml). Verification failures stop publication. Fix failures with a new release commit and version rather than moving a published tag. If a run fails for a temporary infrastructure or authentication problem before publishing, rerun the failed workflow in GitHub Actions. Check npm first: a published name/version pair cannot be reused.

The workflow publishes stable releases to `latest`; prerelease versions are rejected. A GitHub Release page is optional and does not trigger publication.

## Trusted publisher setup

This is a one-time package setting, not something required for each release. In [npm package settings](https://www.npmjs.com/package/@kfiros/test-studio/access), add a GitHub Actions trusted publisher with these exact values:

| Setting              | Value               |
| -------------------- | ------------------- |
| Organization or user | `realKfiros`        |
| Repository           | `test-studio`       |
| Workflow filename    | `publish.yml`       |
| Environment          | Leave empty         |
| Allowed actions      | Allow `npm publish` |

The workflow must exist in `.github/workflows/` on GitHub. npm requires account authentication to create the relationship. Trusted publishing requires npm 11.5.1+; the pinned Node release includes a compatible npm version.

Repository visibility and npm package visibility are independent. Trusted publishing works with a private GitHub repository, but npm only adds automatic provenance for public repositories. GitHub-hosted README screenshots and contributor links also require access to the source repository.

## Manual publication

If GitHub Actions is unavailable, use Node.js 24.3+ and Bun from a clean release checkout. Make sure the same version is not already being published by a workflow.

```sh
bun install --frozen-lockfile
npm login --registry=https://registry.npmjs.org
npm publish
```

Local `npm publish` runs verification through `prepublishOnly` and builds through `prepack`. Complete npm's browser authentication or two-factor challenge when prompted. `publishConfig` selects the public npm registry and public access.

To inspect an upload without publishing:

```sh
npm publish --dry-run
```

## Verify the release

npm scans newly published versions before making them installable. A successful publish may be followed by temporary 404 responses. Allow a few minutes and retry the installation check; do not publish again just because the version is still unavailable. `npm dist-tag ls @kfiros/test-studio` remains available during scanning. See [npm's publish-time scanning guidance](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).

From outside this checkout, verify the released version:

```sh
npx @kfiros/test-studio@0.1.2 --version
bunx @kfiros/test-studio@0.1.2 --version
```

Replace `0.1.2` with the version being released. Publication behavior follows the [npm publish documentation](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

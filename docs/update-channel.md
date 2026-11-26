# Update channel

Where `omp update` (and the installers) get a standalone binary from, and how a
fork publishes its own.

## Two sources

| Build                                        | Source                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| The upstream repository (`can1357/oh-my-pi`) | The build service (`PI_BUILD_URL`, default `https://build.stencil.so`) |
| Any other repository                         | That repository's GitHub Releases                                      |

The repository comes from `packages/coding-agent/package.json`'
`repository.url`; `PI_RELEASE_REPO=<owner>/<repo>` overrides it, and
`PI_GITHUB_API` points the API at a mirror (`https://api.github.com` by
default). Setting `PI_BUILD_URL` always selects the build service, whatever the
repository says.

`omp update`, the background auto-update, the binary takeover of a
package-manager install, and `scripts/install.sh` all read the same channel.

## What a release must carry

One release per version, tagged `v<version>` (GitHub's `latest` skips drafts and
pre-releases, so a release published as a pre-release is never offered). Each
release carries:

- `omp-darwin-arm64`, `omp-darwin-x64`, `omp-linux-x64`, `omp-linux-arm64`,
  `omp-linux-musl-x64`, `omp-linux-musl-arm64` or `omp-windows-x64.exe` — the
  file for one platform, named like the build service's
  (`omp-<platform>-<arch>`, arch `x64` for x86_64);
- `SHASUMS256.txt` — `sha256sum` output (`<hex>  <file>`) for every asset.

The updater refuses a release without a checksum entry for its file: size and
digest are the only thing standing between a download and the install. There is
no delta patch on this channel; every update downloads the whole file.

## Publishing this fork

`.github/workflows/si-release.yml` builds `darwin-arm64` and `darwin-x64` on the
self-hosted `instabox-medium` runner and publishes them, with `SHASUMS256.txt`,
to a release on this repository. The binaries are cross-compiled on Linux, so
the workflow runs `scripts/ci-macos-sign.sh` afterwards to replace Bun's own
Mach-O signature (a Developer ID when the `APPLE_*` secrets exist, ad hoc
otherwise):

```sh
gh workflow run si-release.yml                 # version from package.json
gh workflow run si-release.yml -f version=19.3.1
```

Pushing a `v*` tag does the same. The native addon for each target is fetched
from the `@oh-my-pi/pi-natives-*` npm package matching `packages/natives`'
version, so bump that package before relying on a new addon.

Only macOS binaries are built here. `scripts/install.ps1` therefore refuses the
binary channel on Windows unless `PI_BUILD_URL` is set.

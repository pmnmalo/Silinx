# @silinx/avr-gcc's changelog fragments

What changed in @silinx/avr-gcc since its last release, one file per change, in the format of Silinx's fragments
([changes/README.md](../../../changes/README.md): `<issue>-<slug>.md`, an optional "In short:" for what the package's
users notice, the "In detail:" items naming the issue). A pull request that changes the package
(`packages/silinx-avr-gcc`) adds its fragment here; it adds one to Silinx's `changes/` too when the IDE's users notice it.

A release of the package assembles them into [CHANGELOG.md](../CHANGELOG.md) and deletes them:
`node scripts/changelog-release.mjs <version> --package silinx-avr-gcc`, then
`npm version <version> -w @silinx/avr-gcc --no-git-tag-version` and
`node scripts/sync-version.mjs --package silinx-avr-gcc`; then the tag `silinx-avr-gcc-v<version>`, which
.github/workflows/silinx-avr-gcc.yml builds, checks against Arduino's native toolchain and publishes on npm.

In detail:

- **silinx-pic24's npm releases (#5509):** the PIC24 emulator's package (`packages/silinx-pic24`) is published on npm
  from its own tag, `silinx-pic24-vX`, as silinx-fpga is from `silinx-fpga-vX` (#1681): the tag starts CI (`ci.yml`'s
  tags), and `silinx-pic24-release.yml`, silinx-fpga's workflow line for line, checks that the commit is on `main`
  and that the package's version is X with its changelog section, waits for that CI run to pass, packs the package
  and publishes the tarball with npm's provenance (trusted publishing, no token). The package is no longer
  `private`; it holds `src/`, `LICENSE` and `README.md`. The release steps are in CLAUDE.md and the package's
  README (`test/silinx-pic24-release-workflow.test.js`).

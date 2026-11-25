In detail:

- **The release waits for the package's own tests (#5595):** `silinx-pic24-release.yml` runs the emulator's tests
  (`test/pic24-*.test.js`, `test/silinx-pic24-package.test.js`, which import the package alone) and publishes when they
  pass, where it waited for Silinx's whole CI on the tag. A break of the IDE outside the package held 0.2.0, 0.3.0 and
  0.3.1. CI still runs on the package's tags.

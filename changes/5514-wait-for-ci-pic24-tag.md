In detail:

- **silinx-pic24's release finds CI's run of its tag (#5514):** `scripts/wait-for-ci.mjs` took only the IDE's
  `v*` tags and silinx-fpga's `silinx-fpga-v*` as a release's CI runs, so `silinx-pic24-release.yml` (#5509) never
  found its tag's run and failed after 10 minutes ("no CI run of the tag or of main for this commit"). The tags
  are one pattern now, `RELEASE_TAG`, and a test checks every tag of `ci.yml` against it.

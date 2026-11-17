In detail:

- **The 7-series against Vivado in the weekly Quality workflow (#3834):** a job of its own, before the ISE comparison's
  parts (its 22 builds about 2-3 hours; the ISE comparison takes the rest of the window and resumes), runs
  `scripts/xc7-vivado-compare.mjs --guard --update` on the self-hosted runner, Vivado's image there; its results
  (`test/xc7-vivado-comparison.json`, docs/TOOLCHAIN.md's table) are pushed to the branch `quality-results` with the ISE
  comparison's, each only when its comparison passed. `--guard`: nothing written, the job failed, when a build that
  passed in the recorded results fails now.

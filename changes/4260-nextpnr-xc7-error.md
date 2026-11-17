In short:

- **The 7-series' Place & Route says nextpnr's error:** when nextpnr stops on an error, Place & Route fails with it
  ("nextpnr failed: nextpnr stopped on an error: …"), not with "Cannot read properties of undefined" or "undefined".

In detail:

- **nextpnr's error when it stops with a WebAssembly exception (#4260):** nextpnr-himbaechel-xc7 stopping on an
  `ERROR:` line throws an exception with no message; nextpnr's runner now turns it into nextpnr's last `ERROR:` line,
  and a run in a worker thread of its own (the local server's best of 3 seeds) fails with it instead of resolving with
  no files. The same for every family's nextpnr. Tests: `packages/silinx-fpga/test/nextpnr-io.test.js`,
  `test/xc7-seeds.test.js`, `test/nextpnr-xc7-cyinit.test.js`.

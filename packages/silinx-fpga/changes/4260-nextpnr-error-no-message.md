In short:

- **nextpnr's error said when it stops:** a 7-series run of nextpnr that stops on an `ERROR:` line, in a worker thread
  of its own (`runApart`) or not, rejects with that error, not with no files or an undefined message.

In detail:

- **A nextpnr exception with no message turned into its error (#4260):** nextpnr-himbaechel-xc7 stopping on an `ERROR:`
  line throws a `WebAssembly.Exception`, not the package's `Exit`, and it has no `message`. `nextpnrIo().run`
  (`src/nextpnr-io.js`, every family's runner) now rejects with an `Error` saying "nextpnr stopped on an error:" and
  nextpnr's last `ERROR:` line (the exception its `cause`), as an `Exit` rejects with its exit status; the xc7's worker
  (`src/nextpnr-xc7-node-worker.js`) posts an error even with no message, and `runXc7Apart` takes any `error` as a
  failure, so a run apart no longer resolves with no files. The Spartan-6's seed line no longer repeats the error the
  message says. Tests: `test/nextpnr-io.test.js`, `test/xc7-seeds.test.js`, `test/nextpnr-xc7-cyinit.test.js` (a run
  apart).

In detail:

- **The local server's pages without `'unsafe-eval'` in their Content-Security-Policy (#4741):** the Board Emulator's
  compiled engine is compiled and run in its worker only; the page checks the design (what cannot be compiled, its
  warnings) without running any of its generated code (`CompiledBoard.checked`). The static editions keep
  `'unsafe-eval'` for their workers, started from Blobs, which run under the page's policy; SECURITY.md says why, and
  why their `connect-src` keeps `*.workers.dev`.

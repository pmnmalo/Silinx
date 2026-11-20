In detail:

- **The HTTP API's refusals, one envelope, checked bodies, no server paths (#4753):** every router answers a refused
  request with `{ error, hint?, …details }` (server/http-errors.js: the server's routes, git's, the KiCad
  libraries'), and a file system's own error is never sent with the server's paths (an internal error; the KiCad
  routes' and PUT /toolchain's rewrapped errors by what failed and its code). `POST /projects/:p/implement` and
  `POST /projects/:p/capture` check their body as the MCP's run_process and capture check their arguments, with the
  same messages ("toolchain: one of silinx, open, ise, vivado"; an unknown field refused); a capture's timeout is at
  most 600 s, in the MCP's capture too. `PUT /toolchain` refuses a setting it does not know rather than keep it in
  config.json. `GET /projects/:p/bitinfo` says the bitstream's path in the project (`build/top.bit`), not the
  server's. `GET /projects/:p/export.xise`, which writes nothing since #1432, no longer takes the project's lock.

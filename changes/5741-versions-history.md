In short:

- Project ▸ Versions… shows, for the version selected, the files that differ from the project now: each one opens as
  the version had it (read only), compares with now (a drawing by its objects, any other file by its lines), or is
  restored alone.

In detail:

- **A version against now (#5741, phase 3 of #5743):** `core/versions.js` `versionChanges` (the files changed, added
  and removed since, and silinx.json), through `GET /projects/:p/versions/:id/diff` and the browser edition's
  IndexedDB; the Versions… dialog lists them under the versions for the one selected, with Open (a read-only document,
  "Read-only, as it was in version N", as History… opens a commit's file: `web/js/versions-files.js`), Compare (the
  merge view's side-by-side compare) and Restore (that file only, the project before it kept as a version), in
  Portuguese. The MCP's `version_diff`: the files that differ, or one file's change (a drawing by its objects, any other
  file as a unified diff, as `git_diff`, whose text is now `server/mcp-file-diff.js`'s, the same). Tests: versions,
  server-versions, mcp, mcp-modules, xise-routes, the UI's versions (both interfaces, Portuguese) and
  standalone-versions.

In detail:

- **A copy's ancestor recorded (#4205, phase 1 of #4204):** Export Project (.zip) as Silinx, the MCP's
  `export_project` and Share Project's links give a copy. The project gets an id (once), and the copy's
  `silinx.json` names its origin (`origin: { id, rev, at }`: the project's id, the revision of its files, the date).
  The zip carries the ancestor (`silinx.base.json`), which the project keeps too: a hidden `.silinx/snapshots/` in the
  server editions, the browser's storage in the browser edition, the newest few. An import gives the copy an id of
  its own and keeps its origin and its ancestor apart (checked, never a project file), and a copy of a copy keeps
  its first origin. The interface's description never changes the id or the origin. This is what Merge
  Contribution… (#4206) will merge with (`core/project-rev.js`, `server/project-snapshots.js`,
  `web/js/snapshots-local.js`).

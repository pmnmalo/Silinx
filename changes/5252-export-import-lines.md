In short:

- Export Project (.zip)… no longer says a moment later that `silinx.json` changed outside Silinx, and Import Project…
  of a Silinx project no longer counts its sources twice.

In detail:

- **Export Project (.zip)…: no "Changed outside Silinx" line (#5252):** a Silinx zip given out writes the project's id
  the first time (a copy's origin, #4205), a write the server's watcher did not take for its own: the export's request
  (`GET /api/projects/:p/export.zip`) held the project as the page's other requests that write do, its write recorded
  (`server/server.js`): not told to the page that exported it, told to another tab on the project.
- **Import Project…'s counts (#5253):** the other files of a Silinx zip or folder counted its sources and its
  constraints too ("3 source file(s), 3 other file(s)" for 3 files); they are those that are neither, as an ISE
  import's (`server/project-zip.js`), in the interface's line and the MCP's `import_project`.

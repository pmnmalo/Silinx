In short:

- Project versions: Project ▸ Save Version… keeps the whole project as it is, with a name; Project ▸ Versions… lists
  the versions kept and restores one. A version is also kept on its own as you work (at most one every 10 minutes) and
  before every command that replaces or removes files (Remove from Project, Delete, a conversion, an import, Merge
  Contribution, a git pull, merge or branch switch). A restore keeps the project as it was first, so it can be undone.

In detail:

- **The version store (#5740, phase 2 of #5743):** `core/versions.js`: a version is the project's text files and its
  silinx.json, each text kept once by its SHA-256, with its time, author, name and what made it; bounded (the named
  ones kept, the others all for an hour, one an hour for a day, one a day for a month; 200 versions and 64 MB of texts
  at most, the oldest unnamed ones first). Kept by the local server in the project's hidden folder `.silinx/versions/`
  (never a file of the project, exported or shared: `server/versions.js`), and in the browser edition in IndexedDB
  (`web/js/versions-local.js`, renamed and deleted with its project). A restore (the whole project, or one file) keeps
  the project's own id, name and trust (it never trusts a project again), makes the drawings' HDL again, and is kept
  as a version of its own; its writes are told to the page as another process's.
- **Automatic versions:** a save once the project has been quiet for 20 s (every write of the server's: the page's, the
  MCP's, git's; the browser edition's), at most one every 10 minutes; one before each of the page's risky commands (by
  their label: `web/js/versions-risky.js`) and before the MCP's tools that replace or remove files.
- **Routes and MCP tools:** `GET`/`POST /projects/:p/versions`, `GET /projects/:p/versions/:id`, `POST
  /projects/:p/versions/:id/restore` (docs/PROJECT.md); the MCP's `save_version`, `list_versions` and `restore_version`.
  Project ▸ Save Version… and Versions… (a list and Restore Project; the History view with diffs and one file's restore
  is #5741), in Portuguese. Tests: versions, server-versions, mcp, xise-routes, the UI's versions (both interfaces,
  Portuguese) and standalone-versions (the browser edition).

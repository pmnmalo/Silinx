In short:

- A project whose silinx.json can't be read (conflict marks left by a merge, a mistake in an editor) is no longer
  hidden: Open Project lists it as damaged, and opening it says why. A silinx.json saved with a byte order mark opens
  as any project.

In detail:

- **Project folders (#4755):** a silinx.json starting with a byte order mark (UTF-8 with BOM, an editor's on Windows) is
  read wherever a description is read (`core/project-json.js`: the server, an import, a clone, a merge, the
  `silinx` command). One that is no description (not JSON, or not an object) lists its project as damaged, with why
  (`damaged`: Open Project's row, the MCP's `list_projects`), its name still taken; opening it is a 422 that says why
  and how to mend it, and the page's description is never written over it as a new project's. An import whose
  silinx.json is no JSON warns that its settings were not restored. Delete Project takes the project's lock, and a
  file written, renamed or deleted checks inside the lock that the project is still there: one after Delete Project or
  Rename Project is a 404, no longer a folder made again. Rename Project takes its two names' locks in one order, so
  two renames crossed (A to B, B to A, in two processes) no longer wait for each other until the lock's timeout.

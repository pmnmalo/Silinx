In short:

- **A project folder put in the workspace by hand is untrusted:** Silinx now records the projects you make and the
  ones you trust outside them, in its configuration folder. A folder that reaches the workspace another way (unzipped,
  cloned with git on the command line, restored from the .trash) waits for Trust Project before Xilinx ISE, Vivado or
  programming run for it; the console says so when it opens. Your projects from before the update stay trusted.

In detail:

- **Trust recorded outside the project (#4735):** a project was trusted unless its `silinx.json` said otherwise, so a
  folder placed in the workspace outside Silinx's imports ran ISE and programmed the board with no prompt. Trust is now
  a record in the configuration folder (`~/.silinx/trusted-projects.json`: the project's folder and id,
  `server/trust-store.js`); a project without one is untrusted, its notice and refusals saying why (`core/trust.js`
  `UNRECORDED`), nothing of it written into its `silinx.json`. New Project and the examples record the project; Trust
  Project records it; Rename Project moves the record, Delete Project removes it; the MCP server's, an import's and a
  clone's projects get none (no MCP tool trusts, #2830). The first run records the workspace's projects trusted until
  then, once. The browser edition does the same for a folder on the disk (Open Workspace Folder…), its records in this
  browser (`web/js/trust-records.js`).

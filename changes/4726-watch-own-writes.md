In short:

- **What the MCP server or an editor changes in a project during a synthesis or a save now reaches the page:** it was
  taken for the server's own change and never shown, and the page's next save could overwrite it.

In detail:

- **The server's own writes known by path and by what it wrote (#4726):** the server records what it writes in a
  project (a file, `silinx.json`, a rename, a deletion: `server/own-writes.js`, by the text's hash); while a page's
  request (a save, Set Top, a rename, a deletion) or a run of the server's holds the project, a change that is not one
  of these (the MCP server's, `silinx mcp`, another process; an editor's) is told to every page, the one that asked
  too, and a run's build summary stays the run's. A request whose writes are not all recorded (a git pull, a merge,
  an import) still takes every change made while it runs for its own.

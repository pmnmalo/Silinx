In short:

- **The interface and the MCP server no longer lose each other's changes to a project:** a file the MCP server
  registers while the interface sets the top (or two MCP clients at once) are both kept.

In detail:

- **The project's lock across processes (#4726):** every read-modify-write of `silinx.json` (`updateProject`,
  `writeProject`, a file written, renamed or deleted) runs under a lock file as well as the process's own queue, so
  that the server, `silinx mcp` and the CLI take turns (`server/project-lock.js`). The locks are kept in the system's
  temporary folder, one folder per workspace (never in the workspace: a repository, a synced folder); a lock whose
  process is no longer running, or one not touched for 10 s, is taken over; one held for a minute gives a 503
  "the project '…' is busy (another Silinx process holds it): try again".

In detail:

- **A project's file checked once open, not only by its path (#4744):** reading a file (the file route, MCP's
  `read_file` and the tools that read a project's text) and writing one (the file route, MCP's `write_file`) check that
  the file opened is the one inside the project its path named, so a symbolic link changed by another process between
  the check and the open no longer reaches a file outside it; a file is written through a new temporary file that is
  never a link; a file replaced whole by another writer while it is read (its temporary file renamed over it) is
  opened again and checked again, not refused (`server/paths.js` `openWithin`, `readWithin`, `createWithin`).

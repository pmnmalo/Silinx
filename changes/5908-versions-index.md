In short:

- **The project's versions kept safe:** a damaged versions' index no longer loses the project's history: it is set
  aside, rebuilt from each version's own record, and said in the console.

In detail:

- **The versions' index checked, rebuilt and locked (#5908, the architecture audit #5902):** each version is also kept
  as a record of its own (`.silinx/versions/v/<id>.json`, the browser edition's in IndexedDB), written before the
  index. An index read back is checked entry by entry: one that cannot be read is left out and the others kept (before,
  one bad entry made the whole history read as none, and the next save started again from version 1). A damaged index
  (not JSON, not an index) is set aside (`index.json.damaged-<time>`), never written over, and rebuilt from the records;
  a version's number is never given again; the repair is said in the console (Versions…, Save Version…) and by the
  MCP's `list_versions` and `save_version` (`warning`). A change of the versions runs under the project's lock across
  processes (the web server's, the MCP server's) and, in the browser edition, under a Web Lock across tabs, in one
  IndexedDB transaction.

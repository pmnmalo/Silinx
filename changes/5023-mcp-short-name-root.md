In detail:

- **The MCP's files on Windows under a short-named folder (#5023, #5021):** a project's file and the exchange folder's
  are checked against their folder as `paths.js` `realOf` resolves both, not the folder by the system's realpath: under
  `C:\Users\RUNNER~1\…` (a short name the system expands and the file's path keeps) every project file was refused as
  hidden, and the exchange folder's files as outside it, since #4769.

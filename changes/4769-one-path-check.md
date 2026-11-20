In detail:

- **One syntax check and one containment check for a project's paths (#4769):** a project-relative path's syntax is
  `core/import-gate.js` `normalizePath`'s alone, with options (`names: false`: the syntax without a name's rules;
  `backslashes: true`: a backslash read as '/'), behind a file operation's `filePath`, the browser store's `safePath` and a
  design link's paths; whether a path is inside a folder, once its links are followed, is `server/paths.js`'s (`within`,
  `realOf`), also for the MCP's project files and its exchange folder, which walked the path themselves. A path with a DEL
  character, which the browser store took, is now refused as everywhere else.

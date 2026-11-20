In detail:

- **The project operations' transforms in core, one for the server and the browser (#4766):** a new project's
  silinx.json and its text (`newProjectJson`, `projectJsonText`, `DEFAULT_DEVICE`: core/project-defaults.js) and what a
  file or a folder renamed or deleted does to it (`renameEntries`, `deleteEntries`: core/project-entries.js) are now
  the local server's and the browser edition's stores' alike, where each had its own. Their differences are gone: a
  source renamed to another HDL's name (`.vhd` to `.vh`) takes that language in the browser too, and the server reads
  a GateMate's `.ccf` as a constraints file, as the browser did.

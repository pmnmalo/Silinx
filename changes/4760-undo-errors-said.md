In short:

- A rename that could not be undone says which files kept their new names, never "Nothing was changed"; Export
  Project… says the files it left out.

In detail:

- **Errors no longer dropped on the way (#4760):** a module's rename (Rename…, the MCP's rename_module) whose moves
  failed said "Nothing was changed" even when moving the files back failed too: it now names the files left under their
  new names (core/rename-module.js); Rename Project… whose undo failed threw only the first error, as if the project
  were as it was: it now says what could not be put back, by the file system's code, not the server's paths
  (server/projects.js, `RENAME_TESTING` failing at each step and its undo). Export Project… (and the MCP's
  export_project) left out a listed file missing or a schematic not read without a word: each is a warning. git's answer past 16 MB was read as its first 16 MB: it is an
  error now; and a failing `git diff` before a pull was read as no changes, the files a name clash's pull writes over
  then not kept (#3524): it stops the pull (server/git.js).

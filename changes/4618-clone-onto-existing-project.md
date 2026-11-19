In short:

- **Open from GitHub Repository… onto a project of the same name asks what to do** rather than failing with "already
  exists": open it (Open and Pull, when it is a clone of the same repository), replace it, or keep both under another
  name.

In detail:

- **A clone onto an existing project (#4618):** the question names whether the project is a clone of the same
  repository and what a replace would lose (uncommitted changes, commits not pushed to GitHub, or all of it when it is
  in no repository); Replace asks again, naming them, when there is any. The clone is made and checked before the old
  project is removed (to the workspace's .trash folder; deleted in the browser edition), so a clone that fails leaves it
  as it was. Keep Both suggests a free name (`lab1-2`), which can be edited. The choices are worked out in
  `core/git-clone-exists.js`, for the server editions, the browser edition and the MCP server alike.
- **The MCP's `git_clone` has the same choices (#4618):** `if_exists` (`"error"`, the default, as before, now also
  describing the existing project; `"open"`, `"replace"`, `"rename"`), and `discard_changes` for a replace that would
  lose changes.

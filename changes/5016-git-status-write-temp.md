In short:

- **Git's marks:** a project's row no longer shows a passing "N New: not committed yet" while a file is being saved.

In detail:

- **A write's temporary file is no change of git's (#5016):** a status read while a file was being written (#4758's
  `writeAtomic`: a hidden `.<name>.<pid>.<random>.tmp` beside it, flushed, then renamed over it) listed that file as
  new, the Design pane's project row marked N; and a commit at that moment failed on `git add` in a cloned project (its
  hidden files outside the sparse checkout). `core/git-ignore.js`'s `isWriteTemp` / `WRITE_TEMP`: `server/git.js`'s
  status leaves it out and its commit never adds it.

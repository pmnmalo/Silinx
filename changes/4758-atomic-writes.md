In detail:

- **Project writes whole or not at all (#4758):** every write of a project's file is flushed to the disk before it is
  renamed in (`writeAtomic`, and the description's write, fsync the temporary file), so a crash or a power cut leaves
  the file before or the file after, never an empty or truncated one. The writes that went around it go through it
  now: a git merge's drawings, texts and HDL, a GitHub-held project's files, the pre-merge backup of Merge
  Contribution, an import's files, the files a pull put back, a new project's top, the constraints a board writes,
  and the `silinx ucf` command (a project of the workspace's description changed under its lock, its other fields
  kept). An import that fails halfway (a file that cannot be written, a full disk) removes the project it made, so it
  can be done again (no longer a 409 on a half-built project). The workspace's `.trash` is emptied of what was
  deleted more than 30 days ago (at the server's start and at each deletion; the browser edition's folder too), a
  deleted project's `build/` is not kept, and the hidden folder a crashed Rename Project left goes into it.

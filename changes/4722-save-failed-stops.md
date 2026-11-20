In short:

- **A document that cannot be saved stops the process:** Check Syntax, Implement, Simulate, the Board Emulator, Open
  in VS Code, a commit, an export… no longer run on the older file on disk when an open document could not be saved;
  the console says which document, and its changes are kept.

In detail:

- **`saveAll()` reports the documents that failed to save (#4722):** it ignored `flushDoc`'s failure, so the 32
  actions that save the open documents first carried on with the file on disk. It now returns false and logs
  `ERROR: <documents> could not be saved: stopped, so as not to use the older file on disk`, and each of those actions
  stops (a process's status failed); Open in VS Code no longer swallows the failure, and a failed save of the
  simulation's dropped stimuli is said in the console instead of ignored.

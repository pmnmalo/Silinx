In short:

- **The console's filters no longer hide the application's own lines:** the Trust Project notice of a project from
  outside, Silinx's own information, warnings and errors (a refusal, "No quick fix here.") are shown under every filter
  and in every task, and no longer take the source of whatever process ran last.

In detail:

- **The console's channels (#4729):** a line after a process's result ("Process … completed / failed / stopped", the
  Board Emulator's line) is the application's until the next process's header, never the last process's; an unknown
  process is the application's, not Implementation's; Try it and an exercise's Run Tests are Design's, Verify
  Equivalence / Property / Assertions Simulation's; the application's lines are shown under every filter and task. Its
  own messages say their source: `logError`, `logWarning`, `logInfo` and the new `appLog` (the Trust Project notice,
  the changes made outside Silinx, opening a link, importing a project, the wizards' lines), Merge Contribution
  through `collabLog` (Design's), the logic analyzer Implementation's; SSim's and the emulator's mirrored lines keep
  their own source without changing the lines after them. `test/collab-log.test.js` finds the collaboration's modules
  by the server calls they make too.

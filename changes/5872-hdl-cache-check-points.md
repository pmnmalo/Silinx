In short:

- A drawing replaced in the project's folder, or its HDL file edited by hand, is noticed at once while the project is
  open (Finder, an editor, git), as it is opened, and before Check Syntax (so every run) and Export Project: the HDL is
  made again from the drawing, and an edited file is kept in a version first, with a warning in the console.

In detail:

- **The drawings' HDL files checked at every check point (#5872, part 2):** `web/js/drawing-check.js` runs
  `core/drawing-sync.js checkDrawings` (part 1) as a project is opened, when the local server's watcher tells the page
  that a drawing or an HDL file changed on disk, before Check Syntax (which every run starts with: simulation,
  synthesis, implementation, the Board Emulator, timing) and before Export Project; the browser edition the same
  through its own store. While the project is open the check waits for its folder to be quiet (a git checkout, a burst
  of writes: checked once, on their last state), after the open editors were reloaded or the user chose between their
  changes and the disk's (#2843's question); a file an editor deletes and writes again is a change, its editor kept; a
  drawing with errors written there is said once, its HDL left. The console says what was made again ("… (the drawing was changed outside Silinx)") and warns
  of an HDL file changed outside Silinx, kept in a version; a drawing with errors stays Check Syntax's error (#5799).
  The MCP's flows (`check_syntax`, `check_constraints`, `simulate`, `simulate_drawing`, `verify`, `run_process`,
  `timing_paths`, `export_project`, `grade`, `check_system`, `c_simulation`, `c_cosimulation`) check first and start
  their result with the same lines (`server/mcp-drawing-check.js`). A drawing made into its HDL file at opening gets its
  silinx-sync line too. Portuguese translations of the new lines and of the versions' new reason.

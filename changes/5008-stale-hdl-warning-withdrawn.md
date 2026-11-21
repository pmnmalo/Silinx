In short:

- **A drawing's "not updated" warning goes away once it is fixed:** the Warnings tab no longer keeps "src/x.vhd not
  updated: … has errors" after the drawing was corrected and its HDL made again (the Console keeps the line).

In detail:

- **A drawing's HDL warnings withdrawn when its HDL is made again (#5008):** an editor's save of a drawing with errors
  (a state diagram, an ASM chart, a truth table… often its autosave in the middle of an edit) writes "WARNING:
  src/x.vhd not updated: … has errors"; its entry stayed in the Warnings tab after the drawing was corrected and its
  HDL made again. The sync's warnings are now a run of their own per HDL file, dropped from the Errors / Warnings tabs
  when that file is up to date (console.js's dropRun, as a process's rerun drops its last run's, #4728). This was the
  nightly's Firefox failure of the ASM chart editor's UI test: on a slow runner the autosave caught the chart half
  drawn, and its stale fifth warning kept the test from seeing its four. Test: drawing-sync-editors (the warning in
  the Warnings tab, out of it once fixed, its Console line kept, listed again when broken again).

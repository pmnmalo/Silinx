In detail:

- **The console's runs (#4749, step 2):** `startRun({ process, source, of })` (`web/js/console.js`) writes a process's
  header and returns its `log`, `line` and `end`: every line it writes carries its source, its run and its process,
  whatever else writes meanwhile, so two processes at once no longer mix their lines under one filter; its header
  written again drops its last run's entries. Check Syntax, Check Constraints, a drawing's Check, the simulations, the
  C simulations and report, an exercise's tests, a lab's Check Syntax, Implement and its steps and the Silinx
  synthesis write through runs; iMPACT's, Program's and the Board Emulator's lines state their source.

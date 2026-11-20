In short:

- **Messages in the console, not in boxes:** a command that fails or refuses (Open Project while an implementation
  runs, Convert to State Diagram, Set as Top Module, Rename, iMPACT, the Board Emulator…) says so in the console with an
  entry of the Errors tab, no longer in a box to close; a design's errors are listed a line each. A wizard that cannot
  make what it was asked says why in the wizard, which stays open; Import Project says what is missing in its dialog.
  A truth table's refused names or expression, a live simulation's error and a command from the command palette that
  fails are in the console too; the truth table's hint lines are tips.

In detail:

- **No modal box for a message (#4747, docs/UI-GUIDELINES.md):** `commandError` / `commandWarning` / `commandInfo`
  (`web/js/console.js`) write `ERROR: <command>: <message>`, each line of a list its own, the command's name and the
  message translated apart, its tab in front; every `alertDlg` of a command's failure or refusal uses them. `wizard()`'s
  `finish` (Finish's last check: what the wizard makes, made) keeps its error in the wizard (the Petri net, circuit,
  FSM, ASM, module, schematic, test bench, clocking and block memory wizards); the Test Bench Wizard's vectors' errors in
  its page; Import Project's `validate`. The editors' messages through `message()`: the truth table's (its shape's and
  expression's errors; its hint lines its table's and field's tips), Try it's (the toolbar says Stopped), Save PNG's, the
  command palette's. I/O Pin Planning with pins left unassigned: a warning, not a "done" toast. "Cannot be shown as a
  state diagram" as the MCP says it, on one line.

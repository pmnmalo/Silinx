In short:

- **The Board Emulator's run statistics at its bottom:** in the Silinx interface too, its time, cycles and rate are in
  its status line, the last line, as the design editors' (no longer below the board), the board's line back below the
  board; the cycles grouped one way, 1,246,995,500 (in Portuguese 1 246 995 500).

In detail:

- **The Board Emulator's status line in the Silinx interface (#3920):** the emulator's statistics (t = … · … cycles · …
  kHz (…% of real time)) stay in its status line (`statusLine()`, `.doc-status`), shown in the Tasks interface as in the
  ISE style one, rather than moved below the board in place of the board's line (#1022); the board's zoom leaves the
  line its room. The cycles are grouped by commas whatever the browser's locale (it was `toLocaleString()`'s), by
  no-break spaces in Portuguese. docs/UI-GUIDELINES.md and CLAUDE.md say so. Tests: tasks (the line at the bottom, its
  look, its text in English and Portuguese, both interfaces), emulator-parts, sim-emu.

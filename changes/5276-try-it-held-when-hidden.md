In short:

- **Every Try it pauses while it is not seen:** the state diagram's, the ASM chart's and the Petri net's Run, the
  schematic's and the circuit's clocks and the System Emulator pause behind another browser tab or document tab, as
  the Board Emulator does, and go on where they were when seen again; the Board Emulator's When hidden ▸ Keep running
  keeps them all running.

In detail:

- **Every running Try it held while it is not seen (#5276):** the Board Emulator's rule (#719) moved to
  `web/js/when-hidden.js` (the When hidden setting, its key unchanged; a watcher of the page's and of an element's
  visibility; an interval held while not seen, a fresh one when seen again: no burst of steps; the next frame, a timer
  while the page is hidden) and used by the Board Emulator (unchanged), the state diagram's, the ASM chart's and the
  Petri net's Run, the circuit's clock sources (their simulated time stands still), the schematic's Try it clocks and
  the System Emulator (on in real time when seen again, the time held not caught up). One setting for all: the Board
  Emulator's When hidden choice, its tip saying so. The waves' runs (bounded) and the MCP server's simulations (no view)
  are unchanged. Tests: web-when-hidden (the setting, the watcher, the interval, the next frame), the UI's
  try-it-hidden (each Try it held behind another document tab and while the page is hidden, on again, Keep running),
  system-emu (Emulate held and on in real time), emu-hidden (its tip).

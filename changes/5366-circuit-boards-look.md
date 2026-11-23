In short:

- **The boards in a circuit look like the real ones:** the Basys2 and the Nexys2 are drawn as the Board Emulator draws
  them, and the Arduino Uno and Nano as the System Emulator draws them, at the circuit's scale, with their pins where the
  wires join them.

In detail:

- **The circuit's boards drawn as the emulators draw them (#5366):** `web/js/circuit-draw-board.js` draws a board part
  with the emulators' own drawing: the Basys2's and the Nexys2's (`basys2Art`, `nexys2Art`) with their LEDs, switches,
  buttons, digits and power switch where the Board Emulator puts them (`basys2Places`, `nexys2Places`, the layouts'
  `putPlaces`), and the Uno's and the Nano's (`arduinoArt`). All of it is SVG, so Print and the image export include it.
  A pitch of the drawing is a pitch of the grid, and its pin 1 is the part's place (`core/circuit-boards.js`
  `BOARD_ART`). The part's body is the drawing's: Fit and Print take it in. The board's id is under it, and its outline is
  lit when it is selected. A turned board's drawing turns with it.
- **The boards' pins where the real ones are (#5366):**
  - The Pmods are 0.9 inch apart (JA1, JB1…), in the Board Emulator's drawings too, and a 12-pin Pmod's rows are 0.1 inch
    apart (the Nexys2's).
  - The Uno's power and analog headers are under its digital header as on the board (A5 under D0). The Nano's USB
    socket is by D12 and D13.
  - The System Emulator's Arduinos are drawn with these headers.
  - A circuit made before this change has its wires on a Basys2's or Nexys2's JB, JC and JD, or on an Uno's bottom
    headers, off the board's pins.
- `noMenu` moves to `web/js/emulator-pcb.js` (`emulator-board.js` still exports it), so that the boards' drawing
  imports no emulator module first.

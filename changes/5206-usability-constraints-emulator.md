In detail:

- **Usability tests of the pins and the Board Emulator (#5206, its fifth phase):** `test/usability/constraints.test.js`
  gives the stopwatch example's pins in I/O Pin Planning as a person does. Its pins are cleared (Clear All), then each
  port is dragged from the Ports panel of the Board view onto the board (the switch, the buttons, the LEDs, the digits)
  or onto a row of Board Resources (the clock, its period with it; the decimal point), each drop's line exact in the
  console, and undone to the start and redone. A pin another bit has is typed in the table: both rows are marked, the
  console warns once it is saved, and Implement Top Module is refused with the constraints' error, exactly. The pin
  typed right, the design is implemented to the bitstream with no warning, and the UCF on disk gives every bit the pin
  and the clock the period of the example's own UCF.
- `test/usability/emulator.test.js` runs the Board Emulator on the stopwatch, the vga and the uart, and checks what
  the board shows against the design's simulation for the same inputs (`lib/board-ref.js`: core's event-driven
  simulator on the behavioural RTL, not the emulator's compiled netlist). The stopwatch is started, given two laps,
  stopped, its laps recalled and cleared, each button held by a Shift+click while paused and let go the same way, so
  that the board's time of each press is exact; its display and LEDs are the simulation's at the same cycles (its
  timing generics and the cycles divided by 1000). The vga's picture on the VGA monitor is the simulation's first frame
  found from its sync pulses, pixel by pixel, with the monitor's timing line; SW0 on and BTN0 held for ten frames move
  the square four pixels a frame, the picture the simulation's with the square there. The uart's Serial terminal sends
  a line typed and shows its echo, then BTN0's message; the terminal, the display and the LEDs are the simulation's.
  The console's lines are exact at every step. In both interfaces and in Portuguese, about two and a half minutes a
  configuration.
- New helpers: `lib/board-ref.js` (the board's reference: the display, the serial port, a VGA frame and its timing
  read as a person reads them), `lib/emu-actions.js` (the Board Emulator's actions and readers) and `lib/pin-actions.js`
  (I/O Pin Planning's kit, Implement Top Module, a UCF's pins), with their tests in `test/usability-lib.test.js`.
- The bug found is a todo: #5292 (the Board Emulator's note speaks of the display's digits for a design that wires
  none, the vga example).

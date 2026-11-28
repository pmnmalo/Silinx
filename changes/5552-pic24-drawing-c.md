In short:

- **A drawing's C on the PIC24:** a state diagram, an ASM chart, a Petri net or a truth table in a PIC24 node of a
  System becomes C for the Explorer 16/32, on its buttons and LEDs by default, and Compile Firmware builds it with XC16.

In detail:

- **A drawing in a PIC24 node generates the PIC24's C (#5552):** the synchronous reactive model's C generator
  (`core/reactive-c.js`) has a HAL of its own per board: the Arduino's (as before, its output unchanged) and the
  PIC24FJ1024GB610's (`core/reactive-c-pic24.js`): its pins' `ANSx` bits cleared, `TRISx` their direction, the inputs
  read from `PORTx` and the outputs written to `LATx` once a tick. The ports' pins are the node's GPIO interfaces',
  else the board's buttons (inputs), its LEDs (outputs), then the pins it leaves free; a pin of the USB-UART, the LCD,
  the EEPROM, the crystals or the PICkit is warned of. The node's program, `<id>/main.c` (`core/node-main-sync.js`),
  calls each drawing's `<module>_init()` and, at every 10 ms tick of Timer1 (Fcy 2 MHz with XC16's erased
  configuration words), its `<module>_tick()`, the watchdog cleared meanwhile; a hand-written C with a `main()` is the
  node's program instead. Compile Firmware (#5482) makes it again first and compiles it; the build plan's sources take
  the drawings. A C++ PIC24 node's drawing is refused (XC16 compiles C). Tests: reactive-pic24 (every example's drawing
  and the edge cases tick by tick against the model, by this computer's C compiler with a stand-in `<xc.h>`, no
  warning, the pins' TRIS and ANS; the node's main.c; with XC16, each one's `.hex` run on silinx-pic24 against the
  model), system-sim-pic24 (the C made), mcp-system-pic24 and xc16-compile-server (MCP: the drawing's C and main.c made
  by write_file, compiled by run_process firmware, the plan), ui/system-firmware-pic24 (both interfaces, Portuguese).
  docs/SYSTEMS.md.

In short:

- **The PIC24 emulator loads XC16's .hex and runs as a System's node:** its interrupts and traps, its configuration
  words (the oscillator and so its instruction clock), its time in ps, `run(t1, inputEvents)`.

In detail:

- **The interrupt controller, the HEX, the node (#5480):** the interrupts tested (their priorities against the IPL,
  the natural order, nesting and NSTDIS, DISI, the traps above them and in their order, the stack frame and RETFIE, a
  REPEAT interrupted and resumed, a sleep woken); XC16's Intel HEX read and written (`parseHex`, `writeHex`: four
  bytes a program word, its phantom byte, the extended linear addresses, the configuration space, the checksums);
  the configuration words read (`readConfig`: FNOSC and PLLMODE, Fcy = Fosc / 2, the Explorer 16/32's 8 MHz crystal as
  the primary oscillator, FWDTEN's watchdog said); `Pic24Node`, the scheduler's `run(t1, inputEvents)` with its time in
  ps, its pins' hooks for the peripherals (#5481: `onInput`, `drive`), its log, its state saved and restored. Tests:
  HEX records by hand, its errors, the configurations, the node's times; small programs from reset (a multiply and
  divide routine with its cycles counted by hand, an interrupt-driven counter, a PSV and TBLRDL table sum).

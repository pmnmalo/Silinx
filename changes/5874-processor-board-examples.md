In short:

- The FPGA examples' designs on the Explorer 16/32 (PIC24): blinky-pic24, traffic-pic24, stopwatch-pic24, clock-pic24
  and lock-pic24, in New Project ▸ Board ▸ PIC24 ▸ Start from, to compare the hardware and the software solution of the
  same problem (#5874).

In detail:

- **The processor boards' examples (#5874):** the FPGA examples' designs with the same behaviour on the Explorer
  16/32's LEDs, buttons, LCD and potentiometer, in PIC24 assembly with their `.hex`: the knight rider and its steps,
  the pedestrian crossing, the stopwatch with laps, the clock set with the buttons, the combination lock (its digit set
  with R6). New Project's Start from lists the examples of the Board Type chosen, an example is made on any board of
  its type, its program opened. The MCP's `list_examples` gives each example's Board Type and lists only those of a
  `mode` and a `board_type`; `new_project_from_example` makes a processor board's example, on another board of its type
  with `board`. Each example is checked and emulated by `test/processor-examples.test.js` (its behaviour and no
  warning), and made in New Project by `test/ui/processor-examples.test.js`.

In detail:

- **Digital circuits, phase 2's parts (#3899, part of #3897):** the full breadboard (its rails split in the middle); a
  slide switch (SPDT), DIP switches (4 and 8), pull-up and pull-down, a clock source (0.1 to 50 Hz, an input ticked in
  real time); 7-segment displays (common cathode and common anode), an LED bar; the 7401, 7402, 7403, 7405, 7406, 7410,
  7411, 7414, 7420, 7427 and 7430 (open collector outputs a 0 or nothing, a wired AND with a pull-up); the 4001, 4011,
  4030, 4069, 4070, 4071 and 4081 (a floating input reads X; their delays at 5 V). Each has its datasheet's pinout and
  its ports' names (`<label>_<k>`, a display's `<label>_a` … `_dp`); `core/circuit-ics.js`, `core/circuit-io.js`.
- **Their check, their HDL, their MCP tools (#3899):** the check also says the open collectors on + or beside a totem
  pole output or with no pull-up, a contact shorting the supply, an input floating while a contact is open, a display's
  common on the wrong rail. The HDL writes a pulled net explicitly (the VHDL simulator's weak values: #3926).
  `edit_circuit` sets a DIP switch's levers and a clock's frequency; `simulate_drawing` takes every input by its port.
  Checked against truth tables written in the tests, through the engine and through the HDL in VHDL and Verilog. The
  editor's drawing of these parts follows.

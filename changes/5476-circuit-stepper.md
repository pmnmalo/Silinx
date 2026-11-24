In short:

- **Circuits:** a stepper motor (28BYJ-48 on its ULN2003 board) among the Outputs: its coils' pattern turns its shaft,
  half or full steps, either way; an Arduino steps it.

In detail:

- A stepper motor, the 28BYJ-48 on its ULN2003 board, as a circuit's part (#5476, part of #3902):
  core/circuit-stepper.js; IN1..IN4 its coils A to D, the board's GND and VCC; its rotor follows the coils' place, one
  or two half steps (in order A, AB, B, BC, C, CD, D, DA clockwise), 4096 half steps a turn of its shaft; a jump it
  cannot follow (the opposite coil) or a step sooner than 1 ms after the last not followed, said once; no coil or three
  still; unpowered still. Its HDL (core/circuit-hdl-stepper.js, simulation only): where it stops (20 ms with no step),
  `M1 at 512 half steps`, the live one's, in VHDL and in Verilog, no lint warnings. Drawn as the part
  (web/js/circuit-draw-stepper.js, CSS tokens): its board, its ULN2003, its LEDs lit with their coils, the motor, its
  shaft's arm at its angle. In Try it its simulated time follows the real one. Its checks (not powered, its inputs
  driven by nothing, joined to nothing), Part info, the Parts panel's Outputs, Portuguese; left out of the KiCad
  export. A System's circuit node, its emulator and the MCP's simulate say it. simulate_drawing says its steps and
  angle, and now a device's own warnings (a stepper's stall, a servo's pulses, a sensor's), once each, as Try it's
  console does; circuit_parts lists it. Tests: circuit-stepper (its steps either way, its refusals, a whole turn, in a
  circuit, its checks, its HDL in VHDL and Verilog the live one's, an Arduino stepping it 512 half steps through a
  System), mcp-circuit, mcp-system, web-i18n, circuit-coverage, kicad-library; the UI's circuit-stepper, both
  interfaces and Portuguese, and the Parts panel's counts (Fixes #5476)

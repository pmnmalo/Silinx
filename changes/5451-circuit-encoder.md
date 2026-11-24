In short:

- **Circuits:** a rotary encoder (KY-040) among the Inputs: turned with ↺ and ↻ in Try it, its knob pushed; a program
  counts its detents.

In detail:

- A rotary encoder as a circuit's part (#5451, part of #3902): core/circuit-encoder.js, a KY-040's CLK (A), DT (B), SW,
  + and GND; its pull-ups hold CLK and DT high, a turn joins them to GND in quadrature (A first clockwise, B first
  anticlockwise), a quarter each millisecond, 20 detents a turn; its knob joins SW to GND (no pull-up of its own). Its
  inputs A, B and SW are ports of the HDL (ENC1_A, ENC1_B, ENC1_SW). Drawn as the module (web/js/circuit-draw-encoder.js,
  its colours CSS tokens): ↺ and ↻ turn it in Try it and in the System Emulator, its knob's mark at its angle, the knob
  held down its switch. Its checks (its switch floating while released, a short while turned or pressed, named), Part
  info, the Parts panel's Inputs, Portuguese; left out of the KiCad export. The MCP: simulate_drawing turns it by its id
  (+n, −n), circuit_parts lists it. Tests: circuit-encoder (its contacts, its quadrature, its checks, its HDL in VHDL
  and in Verilog with no lint warnings, an Arduino counting its detents through a System), mcp-circuit, web-i18n; the
  UI's circuit-encoder, both interfaces and Portuguese (Fixes #5451)

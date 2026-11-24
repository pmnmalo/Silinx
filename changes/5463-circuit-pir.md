In short:

- **Circuits:** a motion sensor (PIR, HC-SR501) among the Inputs: hold its dome while trying it and its OUT goes to 1
  for its hold time, retriggering or not, as its jumper says.

In detail:

- A motion sensor, PIR HC-SR501, as a circuit's part (#5463, part of #3902): core/circuit-pir.js; someone moving (its
  input, held as a button's press, an input of the HDL) sets OUT to 1 for its hold time (`hold`, 3 to 300 s); its
  jumper at H (`retrigger`, by default) keeps OUT at 1 while they move and for its hold time after, at L it falls its
  hold time after the rise; then it is blind for 2.5 s, set again if they still move; unpowered its OUT open. A
  device's part's input reaches it (the live simulation's input(k)), its times are its own wake-ups (Try it's real
  time). Its HDL (core/circuit-hdl-pir.js, simulation only): its OUT where the live one's is, in VHDL and in Verilog,
  in both modes. Drawn as the part (web/js/circuit-draw-pir.js, CSS tokens): its board, its faceted dome (held: someone
  moving; lit while OUT is 1), its pins' names, the waves of someone moving. Its checks (not powered, joined to
  nothing), Part info, Properties (Hold time, Retriggering), the Parts panel's Inputs, Portuguese; left out of the
  KiCad export. A System's circuit node says it; the MCP's simulate takes it as a control. MCP: simulate_drawing sets
  it by its id and says its OUT; edit_circuit's set takes `hold` and `retrigger`, and the HC-SR04's `cm` (#5456: it
  was the interface's only); circuit_parts lists it; edit_circuit's description shortened to keep tools/list under
  its budget. Three faults of the simulator found writing its HDL, avoided and filed: #5464, #5465, #5467. Tests:
  circuit-pir (its steps, in a circuit, its properties, its checks, its HDL in VHDL and Verilog with no lint warnings
  in both modes, an Arduino reading it through a System), mcp-circuit, mcp-system, web-i18n, circuit-coverage,
  kicad-library; the UI's circuit-pir, both interfaces and Portuguese, and the Parts panel's counts (Fixes #5463)

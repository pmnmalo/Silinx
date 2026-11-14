In detail:

- **Digital circuits on a breadboard, the model, the simulation and the MCP tools (#3898, part of #3897):** a new
  drawing, `<name>.circ.json` (docs/CIRCUITS.md): real ICs (the 7400, 7404, 7408, 7432 and 7486 with their datasheets'
  pinouts and 74LS delays), a half breadboard, a supply, logic switches, push buttons and LEDs on a 0.1 inch grid, their
  nets geometric (a pin on a hole is in its strip, a wire joins its ends); an event-driven simulation with the gates'
  inertial delays, a floating 74LS input read high, an unpowered IC's outputs floating, a short X, an oscillation said;
  its check (short circuits, unpowered or reversed ICs, floating inputs, LEDs that never light, parts and wires that
  join nothing, labels); its HDL in VHDL and Verilog (one entity per IC, named after the circuit), simulated by Silinx as
  the engine. The MCP server: `new_source` type `circuit`, `circuit_parts`, `edit_circuit`, and circuits in
  `check_drawing` and `simulate_drawing`. The editor follows.

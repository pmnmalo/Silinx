In short:

- **Digital circuits, the sequential ICs:** flip-flops (7474, 7476, 74112), counters (7490, 7493, 74161, 74163, 74191,
  74193, 4017), shift registers (74164, 74165, 74194, 74595) and the 4511 latching decoder, in the circuit editor's
  library (Sequential) and the MCP server's.

In detail:

- **The sequential ICs of the digital circuits (#3900, part of #3897):** `core/circuit-seq.js`: each IC's datasheet's
  pinout, its delay and its model written three times the same way in the clocked style (the engine's processes run on
  their sensitivity's changes, as VHDL's; VHDL processes and Verilog always blocks), their registers X at power-on; the
  engine runs them (`seq`), `core/circuit-hdl-ics.js` writes them. The generated circuit's nets start unknown (X), not
  floating (no instant a 74LS input reads high). Tested: the pinouts, a scenario per IC (its datasheet's behaviour), and
  the engine against its VHDL and Verilog step for step on a random walk of its inputs, no warnings.

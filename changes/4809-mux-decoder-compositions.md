In short:

- The multiplexers, decoders, demultiplexers and encoders of the schematic palette can be pushed into too: M8_1 of
  two M4_1 and an M2_1, M2_1 of gates; D3_8E of a D1_2E and two D2_4E; a demultiplexer a decoder enabled by its data;
  a priority encoder of two halves and an M2_1 per address bit.

In detail:

- **The compositions of the multiplexers, decoders, demultiplexers and encoders (#4809, part of #4806):**
  `core/symlib-mux.js` and `core/symlib-enc.js`, generated from the symbols' parameters as the adders' are:
  - M2_1 is an inverter, two AND and an OR; M4_1 is three M2_1 in a tree; M8_1 is two M4_1 and an M2_1; M16_1 is two
    M8_1 and an M2_1. An enable is an AND at the output (M4_1E).
  - D1_2E is an inverter and two AND; D(n) is a D1_2E on the top address bit enabling two D(n−1). With no enable, E
    is at 1.
  - A demultiplexer is the decoder of its select, enabled by its data (and its enable, through an AND).
  - The encoders of four inputs are gates. A larger one is two halves: the upper half's V is the top address bit and
    chooses the bits below it (an M2_1 each, priority) or ORs them (one-hot).
  - A bus of w bits is w one-bit blocks sharing their selects, at most four to a drawing (M4_1E_X16: four M4_1E_X4),
    since a gate has no one-bit input for a bus.
  - The selects, the buses' bits and the pins per bit are joined by their wires' names.
- **Tests:** every option is proved equivalent to the symbol's own HDL (Yosys, VHDL and Verilog) and simulated against
  a model, every level drawn with no warnings and no wire crossing. They are views, as the adders' are: the HDL
  generated for the symbols is unchanged.
- **D1_2E** joins its enable to its second AND by name, M2_1 its select between the two AND.
- **The MCP's `symbol_info` and `symbol_composition`** list and draw them as the adders'; Push into works on them in
  the schematic editor, its values from a Try it.

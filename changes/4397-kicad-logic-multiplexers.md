In short:

- **Multiplexers, an ALU, parity and a comparator:** the 74158, 74257, 74258, 74251, 74253, 74352, 74353, 74298,
  74181, 74182, 74280 and 74688, in the Parts panel's MSI group and as KiCad's parts: they work in Try
  it, in the circuit's HDL, simulated and built.

In detail:

- **Multiplexers, arithmetic, comparators and parity written once in VHDL (#4397, group F):**
  `core/circuit-model-mux.js` adds 12 ICs as the decoders are. The 74181 does its datasheet's 32 functions for
  active-high data (Cn and Cn+4 active low, A=B an open collector), its P̅ and G̅ the 74182's inputs; the 74298 stores
  the selected word on its clock's falling edge. An IC's three-state outputs may now be in sections, each
  with its own enable (the 74253's and 74353's two): the engine, the simulation model and the digital model take each
  output's own. The catalogue's KiCad logic ICs that behave go from 224 to 238. The 74398 and 74399 stay drawn only
  until their clock's edge is checked in their datasheet.

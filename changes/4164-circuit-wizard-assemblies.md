In short:

- The Digital Electronic Circuit Wizard has eight assemblies of chips ready to try: a 7-segment display, a counter with
  display, a 4-bit adder, a gate test bench, a comparator, a decoder or multiplexer, a shift register and flip-flops.

In detail:

- **The Digital Electronic Circuit Wizard's assemblies of ICs (#4164):** after Breadboards and a supply, and Switches and
  LEDs, eight assemblies on a full breadboard and its supply, their chips placed, powered and wired to switches,
  buttons, a clock, LEDs and a display (`core/circuit-assemblies.js`; the list stays `core/circuit-templates.js`'s):
  switches into a 7447 and a common anode display (its segments pulled up) or a 7448 and a common cathode one; a clock
  (1 to 50 Hz) into a 7490 (BCD) or a 74161, a 7447 and a display, a button `rst` clearing it; a 7483 or 74283 adder; a
  gate IC (7400, 7402, 7404, 7408, 7432, 7486), each gate on switches and an LED; a 7485 comparator; a 74138 decoder on
  8 LEDs or a 74151 multiplexer and its data switches; a 74164 or 74194 shift register with buttons `clk` and `clr`
  and a switch `din`; a 7474 D flip-flop with a clock button and switches on D, PRE̅ and CLR̅. Each one clean for the
  circuit's checks (no warnings). The MCP's `new_source` takes them (`template`, `template_params`: `chip`,
  `display`, `hz`). In Portuguese. Tests: `circuit-assemblies` (new: each one simulated against a reference written
  from the datasheets, in the engine and in its HDL, VHDL and Verilog, with no warnings), `circuit-templates`,
  `mcp-new-source`, UI `circuit-wizard` (both interfaces, Portuguese).

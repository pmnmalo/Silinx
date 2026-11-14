In short:

- **A digital circuit on the FPGA:** a circuit can be an FPGA project's top: its switches, buttons and clock the
  board's, its LEDs the board's (labels `led[0]`, `sw[0]`, `btn[0]`: a vector port, matched to the board's pins by
  name); its HDL holds the simulation's model and the digital model synthesis builds.
- **The example "breadboard":** 74LS chips on a breadboard counting a button's presses on the LEDs, and a half adder.

In detail:

- **A circuit as an FPGA project's top (#3901):** its generated HDL has two models: the simulation's (the chips'
  delays, `'Z'`, `'X'`, the power) behind `synthesis translate_off` / `translate_on`, which XST and now the Silinx
  toolchain's front end skip (`core/translate-off.js`: those lines blanked, the line numbers kept), and the digital one
  (`core/circuit-digital.js`): the gates inlined, the MSI and sequential ICs as their entity's `digital` architecture,
  open collectors ANDed, a contact's level while closed, a floating net high where a 74LS input reads it and low where
  only an LED does, a 74595's three-state outputs by their enable, the clock's net its port itself. In VHDL the
  `digital` architecture comes first and the simulation's last (the one the simulator binds); in Verilog
  `` `ifdef SILINX_SIM_<NAME> `` chooses, its `` `define `` fenced. Gated clocks of the 74165 and the 74193 marked as
  the chips' own (no lint warning).
- **Buses (#3901):** a single port's label `name[k]` is bit k of the vector port `name` (`std_logic_vector`,
  `[w-1:0]`); the circuit's check refuses a bus with a bit missing, with inputs and outputs, named as a scalar port, or
  on a part of several ports. `edit_circuit` says so.
- **The breadboard example (#3901):** `examples/breadboard`, second in the list: a 74161 counting the presses of BTN0
  (synchronised by a 74164, its edge detected by a 7486 and a 7408), SW0 clearing it, a half adder on SW1 and SW2;
  its self-checking test bench; built by the Silinx toolchain on every board with no warning.

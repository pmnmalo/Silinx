In short:

- **Digital circuits, the MSI ICs:** BCD to 7-segment decoders (7447, 7448), decoders (74138, 74139), multiplexers
  (74151, 74153, 74157), adders (7483, 74283) and a comparator (7485), in the circuit editor's library (MSI) and the MCP
  server's.

In detail:

- **The MSI ICs of the digital circuits (#3900, part of #3897):** `core/circuit-msi.js`: each IC's datasheet's pinout
  (its active low pins' names barred), its delay, its model and its VHDL and Verilog bodies in one wrapper
  (`core/circuit-hdl-ics.js`: the inputs read as a 74LS reads them, an unknown one making every output X, the outputs
  after the delay, open collector ones a 0 or nothing); the engine and the check take an IC's model besides its gates (its
  inputs warned floating once one of its outputs is used). Tested against function tables written in the tests, through
  the engine and through the HDL simulated by Silinx in both languages, with no warnings.

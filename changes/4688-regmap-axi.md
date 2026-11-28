In short:

- A register map on AXI4-Lite: a Zynq's PL registers for its processing system's program, both sides generated.

In detail:

- **The register map on AXI4-Lite (#4688, part 1):** a map's bus may be `axi`, with a `base` (a 4 KB window in
  M_AXI_GP0's 0x40000000–0x7FFFFFFF, 0x43C00000 by default) and each register a 32-bit word at a word's offset. Generated
  from it:
  - its AXI4-Lite slave in VHDL and Verilog (`core/regmap-axi.js`: `s_axi_*` ports, WSTRB's bytes, OKAY responses, the
    strobes);
  - its PS's C header (`core/regmap-c.js`: volatile words at the base), which the editor's Header writes into the Zynq
    node's `ps/`.
  The editor gets the bus AXI4-Lite (Zynq PS) and its base address; switching a map to it puts its registers on
  consecutive words. Tests: `test/regmap-axi.test.js` (the check; the slave compiled and elaborated with no warning and
  simulated in VHDL and Verilog against an AXI4-Lite master; the header compiled for the Cortex-A9 with no warning),
  `test/ui/regmap.test.js` (both interfaces, Portuguese).

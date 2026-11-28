In detail:

- **A Zynq node's PL top, written by Silinx (#4688, part 2):** `core/zynq-pl-top.js` makes the top in VHDL and Verilog.
  - It holds the PS7 (its fixed IO through BIBUFs, FCLK_CLK0 through a BUFG, FCLK_RESET0_N the reset), its M_AXI_GP0
    (AXI3) bridged to the register map's AXI4-Lite slave (single beats, IDs given back, RLAST high), and the student's
    module.
  - The module's ports named as the registers are wired to them; its `clk` gets FCLK_CLK0; its other ports are the
    board's. A port that does not meet its register is said.
  - `fixedIo: false`, the Silinx toolchain's: no fixed IO nor BIBUF (the PS's pins are not the PL's), the PS7's MIO and DDR
    left unconnected.
  - Tests: `test/zynq-pl-top.test.js` (the wiring and its refusals; the top compiled, elaborated with no warning and
    simulated in VHDL and Verilog against stand-ins of the PS7: written, a counter's count read back, every ID given back).
  - Vivado's build with the real PS7 and the board check are #5985. The node's use of the top (its map, the build, the
    MCP) is part 2b.

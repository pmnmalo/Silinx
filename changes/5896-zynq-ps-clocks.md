In short:

- A Zynq node's processing system clocks of its own: its CPU's clock and FCLK0, in its Properties.

In detail:

- **A Zynq node's PS clocks (#5896):** an FPGA node on a Zynq board (and a Board project on one) may set its own
  `psClocks: { cpu, fclk0 }` (Hz), used by Silinx's ps7_init, the System's description and Run PS Program
  (`core/zynq-ps-clocks.js`). The PLLs stay the board's: the CPU is the ARM PLL divided by 1 to 63, at most 667 MHz, and
  FCLK0 the IO PLL divided by two divisors. A frequency they cannot make is refused with the nearest ones they can. They
  are set in the node's Properties (CPU clock, FCLK0, in MHz; empty: the board's) and through the MCP's `edit_system`
  (`fields.psClocks`). The tests check them against Vivado's ps7_init of four boards. Tests: `test/zynq-ps-clocks.test.js`,
  `test/mcp-zynq-ps.test.js`, `test/ui/zynq-ps.test.js` (both interfaces, Portuguese).

In detail:

- **A Zynq's PS program loaded over JTAG, its engine (#4687, part 3):** the ARM DAP of a Zynq-7000's chain
  (`core/arm-dap.js`: its JTAG-DP in batches of transactions, a WAIT retried and a FAULT said, the AHB-AP's and APB-AP's
  words and blocks, CPU 0's debug: halted, instructions run in debug state, started). The loader (`core/zynq-ps-load.js`)
  runs Silinx's ps7_init, writes the ELF to the OCM and reads it back, then starts CPU 0 at its entry. Its writes are
  bounded twice: the plan is checked whole before the first JTAG transaction (ps7_init's registers of the SLCR, the OCM's
  low 192 KB, the entry), and every write goes through a guard that refuses any other address. How the interface and the
  server reach the board's cable follows. Tests: `test/zynq-ps-load.test.js`, on a simulated Zybo Z7 chain
  (`test/fixtures/zynq-dap-sim.js`).

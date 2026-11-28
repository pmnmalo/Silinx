In short:

- A Zynq's PS and PL simulated together: the regs-zynq example's Cortex-A9 drives its PL's counter through the register
  map, and the counts it reads back show on the terminal.

In detail:

- **A Zynq's PS–PL registers in Simulate and Emulate (#4689, part 5c of #4688):**
  - With the node's PS–PL register map (its `psMap`), the PS node is the map's AXI4-Lite slave, transaction by
    transaction (`core/system-ps-pl.js`, `core/system-sim-zynq.js`). It is wired to the module as the PL's top wires it.
  - A write sets its register's pins at its time, and a strobe's `<name>_wr` is high for one clock of FCLK0.
  - A read gives the register's value as the slave does: an ro register's from the module's outputs, an rw one's as
    written, a wo one's 0. The program waits for it in its Worker.
  - A word with no register is read as 0 and written to nothing, said once. The module's `clk` is FCLK0 (50 MHz on the
    Zybo Z7), as in the build.
  - Tests:
    - `test/system-ps-pl.test.js`: the wires, FCLK0, the plan with and without the map;
    - `test/system-sim-zynq.test.js`: the slave's writes, strobe and reads, and an unmapped word said;
    - `test/system-example-regs-zynq.test.js`: the counts the A9 reads back, at the counter's rate worked out from the
      UART's timing;
    - `test/ui/zynq-ps-sim.test.js`: regs-zynq's Try it, its counts on the terminal, both interfaces.

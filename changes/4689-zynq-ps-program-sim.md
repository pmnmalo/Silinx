In detail:

- **A Zynq PS's program simulated, its first part (#4689, part 5a of #4688):**
  - The C interpreter has a program mode (`core/c-interp.js`, `program: true`): a processor's bare-metal C, with no HLS
    checks and no top. An integer cast to a pointer is a memory-mapped register, read and written through the run's
    hooks; an assignment's value is the one written, not read back. A hook may end the run (`Stop`).
  - `core/zynq-ps-sim.js` is the PS's model, as the program sees it: its UART (its bytes at the baud the program sets,
    each with its time; SR's TXFULL and TXEMPTY), GPIO bank 0 (an output pin's changes on the MIO) and M_AXI_GP0's window
    (the PL's registers). Each step of the interpreter is one clock of the Cortex-A9; any other address stops the run and
    is said.
  - Tests: `test/zynq-ps-sim.test.js`. They cover the hooks' accesses in order and the refusals; uart-zynq's and
    regs-zynq's programs run with no diagnostic, their UART's text and its bytes' times at 115207 baud, their registers'
    accesses and LD4's MIO 7; the FIFO waited on, and lost when not; the GPIO's masked writes; an address with no
    register said.
  - Its use by Simulate (the PS UART to its terminal, the PL's registers on the PL's simulation) is the next part.

In short:

- Simulate and Emulate run a Zynq's PS program: the uart-zynq example's hello now reaches its terminal.

In detail:

- **A Zynq's PS in Simulate and Emulate (#4689, part 5b of #4688):**
  - A Zynq FPGA node with a PS program has its PS as a node of the run of its own, `<id>_ps` (`core/system-sim-zynq.js`).
    Its program runs on the PS's model in a Worker (`core/zynq-ps-engine.js`, a page's and Node's), in lockstep with the
    scheduler as an ESP32's MicroPython does, so the run is deterministic.
  - Its UART's frames (8N1 at the baud the program sets) go on the PS UART's link to its terminal; its board's PS LEDs
    (the Zybo Z7's LD4) are its pins. The program's end is said: returned, or an error that stops the node.
  - The check no longer warns that the Cortex-A9 is not simulated. A PS UART on a node with no PS program is left out,
    which the check says.
  - Tests: `test/system-sim-zynq.test.js`, against the PS's model run alone: the same bytes and frame times, LD4's
    changes, the same run twice, the program's end and errors, the plan's PS node and wires, the isolation check;
    `test/ui/zynq-ps-sim.test.js` (uart-zynq's Try it and Emulate, the hello on the terminal, no warnings, both
    interfaces); the examples' tests (their check with no warning, their simulation's terminal text).
  - The PL's registers over AXI4-Lite on the PL's simulation are the next part.

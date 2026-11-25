In short:

- **The System Emulator's toolbar:** it has the Board Emulator's controls that a System has. Step advances one clock cycle
  of its FPGA (one step of 100 µs in a System of several FPGAs), and the rate runs it at real time or slower. Its status
  line names each FPGA node's model.

In detail:

- **The System Emulator's toolbar (#5613, `web/js/system-emu-view.js`),** laid out as docs/UI-GUIDELINES.md says (its
  first line, its ⋮ menu at its right end, its status line last):
  - **Run / Pause.**
  - **Step:** one clock cycle of its one FPGA node; in a System of several, or none, one step of its scheduler, 100 µs
    (Pedro's).
  - **Power cycle**, in place of Restart.
  - **Its rate against real time:** real time, 1/10, 1/100 or 1/1000.
  - **Its ⋮ menu:** what it does while hidden.
  - **Its status line:** the time, the rate, and each FPGA node's model (its RTL until #5612).
- **MCP (#2674):** nothing changes. `simulate` of a System runs as fast as it can, so the rate only paces the view, and its
  `time_ns` is a Step's or a run's.

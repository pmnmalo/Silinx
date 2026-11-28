In short:

- A new System example, **regs-zynq**: the Zybo Z7's Cortex-A9 drives a counter in its programmable logic through a
  register map on AXI4-Lite, and prints the count it reads back on the board's USB serial port.

In detail:

- **The regs-zynq example (#4688, part 4):** a Zybo Z7 node whose PL's `counter` steps every `period` clocks of FCLK0
  while `enable` is set (LD0–LD3 its count). Its map `zybo/cnt_regs.regs.json` (`enable`, `period`, `count`, the strobe
  `clear`) is the node's `psMap`, so its Implement builds Silinx's top `counter_zynq`. Its PS program `zybo/ps/main.c`
  writes and reads the registers at M_AXI_GP0's base, 0x40000000.
  - Tests: `test/system-example-regs-zynq.test.js` (the program's offsets are the map's; the counter with the top, in
    VHDL and in Verilog, compiled, elaborated with no warning and simulated against a stand-in of the PS7 running the
    program's accesses; the example checked with its one warning, simulated with none, its PL built with no warning, its
    PS program compiled).
  - The board check is #5985.

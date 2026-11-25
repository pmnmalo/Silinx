In short:

- **A System's Implement:** in the Silinx interface, the Implement task of a System project shows the System and its
  nodes as a tree. It used to say "No top module is set". Each node's mark says whether its build is up to date, and its
  bar has Build All and Program All.

In detail:

- **The Implement task of a System project (#5581, part 4 of 4):** its panel shows the System's tree
  (`web/js/system-implement-tree.js`, drawn by `web/js/processes.js`).
  - The System's row has Build Plan, Connected Boards, Build All and Program All.
  - A row per node of the build plan, the FPGA nodes first. Its mark is its plan's state (✓ up to date or given, ! out of
    date) and its tip its plan's line. The plan is the local server's, asked again when the design or a build changes it.
  - An FPGA node's row has User Constraints, Synthesize, Implement Design, Generate Programming File and Program Node.
    An Arduino's has Compile Firmware (its firmware, when it is given) and Program Node.
  - A PIC24's and a MicroPython node's Program Node is disabled, its tip why (MPLAB IPE, mpremote), as in the ISE style's
    Processes panel (`programRefusal`, `core/system-program.js`). A double-click says it in the console.
  - The panel's bar has Build All and Program All in place of I/O Pin Planning and Program FPGA.
- **MCP (#2674):** no new tool: `check_system`'s `plan` has each node's state, `run_process` builds a node or the System,
  `program_board` with `node` programs it or refuses it with the same message.

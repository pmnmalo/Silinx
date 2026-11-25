In short:

- **Each FPGA node of a System has its own constraints file:** its pins are in a file of its folder, such as
  `fpga/uart.ucf`, as an FPGA project's are. You edit it with its User Constraints (I/O Pin Planning, Edit Constraints
  (Text), Check Constraints). A System made before has its pins moved into these files when it opens.

In detail:

- **An FPGA node's constraints file (#5581, part 2 of 4; `core/system-constraints.js`):**
  - The file is in the node's folder, in its board's format (UCF, XDC, PCF…). It is named by the node's `constraints`,
    else `<id>/<module><ext>`. The System document no longer holds `pins`.
  - The check, Simulate, Emulate, Implement and Build All read each node's pins from its file. A node with no file is
    warned.
  - Implement uses the file as it is; a change to it puts the node out of date.
  - The examples' System documents (uart-avr, spi-avr, i2c-avr, regs-avr, uart-pic24) have their FPGA node's file. Each
    is the one Implement made from their pins before, its clock's period included.
- **Its User Constraints** (`web/js/system-constraints-ui.js`), in the Emulate task's tree and on the node's row in the
  ISE style:
  - I/O Pin Planning on its board and its module (`web/js/pinplanner.js` takes a node's target).
  - Edit Constraints (Text): the file is made first when the node has none, and the node is told it.
  - Check Constraints against its module and its board (`web/js/implement.js`).
  - The System editor's side panel names the file and has the first two, in place of its "Pins of the board" fields.
- **A System document of before:** its FPGA nodes' pins are moved into their files when the project opens
  (`web/js/project.js`), and the console says so. A followed project's are left to its owner.
- **Bugs found on the way:**
  - The System Emulator drew its boards from the document's System: they now have the run's nodes' pins
    (`web/js/system-emu-view.js`).
  - A System project now reads every constraints file in its nodes' folders, including an editor's node not saved yet.
- **MCP (#2674):**
  - `edit_system` with a node's `pins` sets them in its constraints file, said; a document of before has its pins moved
    when it is written.
  - `check_system`, `simulate` and `run_process` read each node's pins from its file.
  - `check_constraints` with a node's file checks it against the node's module and board.
  - `project_info` lists the file among the node's own files.

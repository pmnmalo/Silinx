In short:

- **Set as Top Module in a System project:** on a module of an FPGA node's folder, it makes that module the node's top
  module, and the System stays the project's top. Before, it made the project an FPGA project again, and the System
  went away.

In detail:

- **A top module is its device's (#5583):**
  - In a System project, Set as Top Module on a module of an FPGA node's folder sets that node's top module, its
    `module` in the System document, which Build Node, Implement and Program Node use (`core/system-top.js` nodeTop,
    `web/js/system-top-ui.js`). The System stays the project's top.
  - The console says `Set as Top Module: 'other' is now fpga's top module (the System uart_avr stays the project's
    top).`, or that it already is.
  - An open System editor takes the change; with unsaved changes it is refused until saved.
  - A module in no node's folder, or in a microcontroller's, is refused, with its reason.
  - The Design pane marks each FPGA node's top module as an FPGA project's top.
  - #5402's switch back to an FPGA project (`toModuleTop`) is gone.
- **MCP (#2674):**
  - `set_top` with a module of a System project sets its node's top, with the same messages.
  - `unset_top` is refused in a System project (an FPGA node always has a top module); its test bench's is not.
  - `set_top`'s description is shorter, for tools/list's budget (#5520).

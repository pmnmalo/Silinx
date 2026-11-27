In short:

- The side panel's pages have no button bars: **Check Design** is in the project's and the device's right-click menus
  (Check System on a System project's), **New Project…** and **Open Project…** head the Start page's Project Commands,
  and **Add to Project…** and **Add Copy to Project…** are in the Files page's files' and folders' menus. Close Project
  stays in the project's menu and the toolbar. Implement's I/O Pin Planning and Program FPGA, Emulate's I/O Pin Planning
  and Emulate, Simulate's New Test Bench… and Import Test Bench… are the project's and the device's menus' first items
  (a System's: Build All and Program All, Emulate System on its row; a node's test bench in its folder).
- A device's row has one menu everywhere, in the Design pane and in Implement, Emulate and Simulate: New Source…, Import
  Source…, I/O Pin Planning (an FPGA's), Check Design, Design Properties…. In Emulate, the device's row has an **[I/O Pins]**
  tag that opens I/O Pin Planning, beside the top module's own I/O Pin Planning (a System's FPGA nodes too). The [New],
  [Import] and [I/O Pins] tags look like the modules' badges.

In detail:

- **The side panel's bars gone (#5939):** the Silinx interface's Check Design / Close Project bar under the Design tree, the
  Start page's New Project / Open Project buttons and the Files page's Add to Project / Add Copy to Project bar are removed
  (`web/js/tasks.js`, `web/js/project.js`, their CSS); their actions are menu items: Check Design (`web/js/device-menu.js`
  checkItem: the top's Check Syntax, disabled with no top; a System project's Check System) in the project's menu
  (`web/js/design.js`) and the device's; New Project… and Open Project… Project Commands' first entries; Add to Project…
  and Add Copy to Project… in the Files page's file and folder menus (`fileContextMenu`'s `files`, a file not in the
  project keeping its own Add to Project). Implement's, Emulate's and Simulate's bars above their trees are removed too
  (`web/js/tasks.js`, `web/js/tasks-sim-panel.js`, a simulation's side panel in `web/js/viewers.js`): their buttons are the
  task's own items of the project's and the device's rows' menus (`web/js/device-menu.js` taskItems; the System's row's in
  Implement and Emulate; Simulate's FPGA node's New Test Bench… and Import Test Bench… in its folder).
- **A device's menu and Emulate's [I/O Pins] (#5878):** `web/js/device-menu.js`, one menu for the device's row of the
  Design pane, of the Tasks interface's Implement, Emulate and Simulate hierarchies (`web/js/device-menu-rows.js`: their
  project's row the project's menu) and of a System's node rows (its device's items before the System's: an FPGA node's I/O
  Pin Planning its own); `web/js/processes.js`'s process trees take a row's `menu` and `tags`. Emulate's device row's
  [I/O Pins] opens I/O Pin Planning in Emulate, only where there are pins to plan (an FPGA with a top module, an FPGA node
  with its module). The tags' look: the modules' badges' (solid; #5873's were bracketed text).

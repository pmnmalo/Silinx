In detail:

- **Co-design: the System editor (#4700):** a co-design project's System document (`.sys.json`) opens in an editor of
  its own, in the schematic editor's style: an FPGA node (a module of the project on a board), an Arduino Uno or Nano and
  a serial terminal placed on its canvas; a UART or GPIO interface added to an FPGA node, its ports and their pins of the
  board, a microcontroller's board and firmware set in its properties; the interfaces linked with the Link tool (a link
  joins two interfaces of one kind, each joining one link: an edit refused says why in the console). Its check's errors
  and warnings are in the console as it is edited (a 5 V output on a 3.3 V FPGA input, a node that joins nothing), and
  Check's lines in the Console, as when it is saved. The Design pane shows the System's row, `<name> [System]`, in place
  of the device, with its FPGA nodes' modules under it. The MCP server's `edit_system` edits the System as the editor
  does (core/system-edit.js), then checks it; `check_system` describes it before its check. Co-design projects themselves come
  with the `uart-avr` example (#4702).

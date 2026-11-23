In short:

- Co-design: register maps in the project (New Source ▸ Register Map): a table of registers, the FPGA's SPI or I²C slave
  generated from it, the Arduino's header written by its Header button, Try it saying each register read or written.

In detail:

- A register map is a drawing of the project (core/view-hdl.js: its HDL file always made from it; its row in the
  Design pane, its Registers badge first; renamed and left out of an ISE export as the other drawings): New Source ▸
  Register Map (not in a release yet), its editor (web/js/regmap-editor.js: a row for each register, its address,
  name, width, access, reset value and strobe; + Register, Remove; the bus, SPI or I²C at its address; Check; Header,
  firmware/<name>.h; its counts in its status line, its problems in the console; read only when followed or on a
  phone), Edit ▸ Undo and Redo; the MCP's new_source regmap, check_drawing of a map and related_view's header (the Header button's text); Simulate
  System's lines and the MCP's simulate say a link's register accesses when its FPGA node is a module made from a map;
  the user's guide (EN, PT) and docs/CODESIGN.md (Part of #5288).

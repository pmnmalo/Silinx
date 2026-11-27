In short:

- Each device's row of the Design pane has **[New]** and **[Import]**: New Source and Import Source for that device, in
  place of the two buttons above the tree. A System's nodes each have theirs, their sources in their folders.
- New Source offers only what the device takes: an FPGA its HDL, drawings, wizards and C / C++ for Silinx HLS; a Circuit
  project its drawings; an Arduino a sketch, C, C++ or assembly; a Pico or an ESP32 a Python program. Import Source the
  same. New Source makes no constraints file any more: I/O Pin Planning does.

In detail:

- **New and Import per device (#5873):** `core/source-types.js`, one table for the interface and the MCP server, says
  what each kind of device takes (an FPGA, a design and simulation project's logic, an AVR, an RP2040, an ESP32, a
  PIC24: none to make, its .hex to import) and where a System's new source goes (`devicePlace`). The Design pane's
  device row (an FPGA project's, a Circuit project's Design row, a System's node, a processor board's) has the tags
  (`web/js/design.js` treeItem's `tags`, `web/js/design-system.js`); the Silinx interface's New Source / Import Source
  buttons above the tree are gone, Project ▸ New Source… and Import Source… / Add Copy of Source… stay (the selected
  device's). New Source's list follows the device, a microcontroller's program first (Arduino Sketch, C Source, C++
  Source, Assembly, Python Program: `core/new-source-text.js`), no Language for a microcontroller; a PIC24's New Source
  says in the console it makes none. Import Source takes the device's files only (its dialog's `accept`, a refusal in
  the console), a System node's into its folder, its constraints its own (`core/import-source.js`); the import gate
  reads an .ino as C. No Implementation Constraints File in New Source, for any device; Import Source still copies an
  existing one. The MCP server's `new_source` (its `constraints` type removed; the microcontroller's types added) and
  `import_source` take `node`, a System's node, and refuse what the device does not take with the same words.

In short:

- A System project's nodes are folders: each node's files (an FPGA node's modules, an Arduino's firmware) are in a
  folder named by the node, renamed with it; removing a node asks whether its folder goes. System projects made before
  are not read: opening one says so.

In detail:

- **A System node is a folder of its project (#5488, roadmap #5479's phase 2):** the System document's version 2;
  each node's files in `<id>/`, the System document at the project's root (`core/system-layout.js`). The edits refuse
  a firmware or a circuit outside its node's folder, and a node renamed takes its firmware's and circuit's paths with
  it. When the System is saved (the System editor's save, the MCP's `edit_system`) a renamed node's folder is renamed
  (silinx.json's entries and the drawings' links to their HDL following, as Rename Folder), and a removed node's folder
  is deleted when the user says so (the System editor asks, as Delete Folder; the MCP's `delete_folders`, to the
  workspace's `.trash`), else kept and said; a folder that cannot be renamed writes nothing. A folder is a path's in
  every store (git's and a zip's too): a new node has none until its first file. An FPGA node is implemented from its
  folder alone (`build/nodes/<id>/`, its module's ports from its folder's sources). A register map's Header goes to the
  System's first microcontroller's folder. A System document of version 1 is not read (no backward compatibility):
  opening its project says so in the console, the MCP's tools refuse it with the same words. The co-design examples
  (uart-avr, spi-avr, i2c-avr, regs-avr) moved to the new layout: `fpga/` and `uno/`. Rename Folder and Delete Folder's
  work, without their dialogs, is `moveFolder` and `dropFolder` (web/js/app.js), used by both.

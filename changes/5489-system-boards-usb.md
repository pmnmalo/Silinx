In short:

- **Connected Boards:** a System's row in the Design pane lists the boards connected to the computer and says which
  node each one is, by its USB id; a node's board can be told apart from another of the same kind by its serial number.

In detail:

- **A System's nodes matched to the connected boards by their USB id (part 2 of #5489):** `core/system-usb.js` gives
  each FPGA and microcontroller node's USB ids (an FPGA board's programmer as the browser drives it, an Arduino's USB
  serial chips, the Explorer 16/32's Microchip debugger) and matches the nodes to the connected devices, the FPGA nodes
  first: a node's serial number its own board, a board that only one node can be that node's. A node with no board,
  two boards that could be one node and one board that could be two nodes are said as warnings, with their exact
  messages. A node's `usb` (`{ vendor, product, serial }`, `core/usb-id.js`) is a field of the System document, edited
  in the System editor's side panel (USB id, USB serial) and by `edit_system`; the check refuses an id that is not one
  and two nodes with one serial number. The local server lists the devices, read only (`server/usb-devices.js`:
  macOS's system_profiler, Linux's sysfs, Windows's Get-PnpDevice, arduino-cli's board list for a serial port's
  address; config.json's `paths["usb-devices"]` a command of the user's instead). The System row's **Connected
  Boards** says them in the console (`web/js/system-build-ui.js`, GET `/projects/:p/boards`). MCP (#2674):
  `check_system` with `boards`, `edit_system`'s `usb`; no new tool (#5520: five tools' descriptions shortened to make
  room). Portuguese (`web/js/i18n-system.js`). docs/SYSTEMS.md: the boards by their USB id. Tests: system-usb (the
  ids, the match and its messages, the document, the edit, the check), usb-devices (the system's listings read, the
  stand-ins' listing, Connected Boards, the MCP), ui/system-boards (both interfaces, Portuguese, the browser edition).

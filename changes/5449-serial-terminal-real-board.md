In short:

- **A real board's serial terminal:** a System terminal's **Real Board…** in the System Emulator joins it to a real
  board's USB serial port through Web Serial (Chrome, Edge): an Arduino's, or an FPGA board's USB-UART, at the link's baud
  and frame, its text shown as the simulation shows it. The MCP server's `serial_terminal` does it on the local server.

In detail:

- **A System terminal on a real board over Web Serial (#5449):** `core/serial-line.js` (a link's baud and frame as Web
  Serial's options and arduino-cli monitor's config, the port chooser's filters from the board's USB ids, the bytes both
  ways, the simulation's text); the System Emulator's Real Board… and Disconnect (`web/js/system-serial-ui.js`), the board
  unplugged and a browser with no Web Serial said in the console; the MCP's `serial_terminal` (`server/serial-monitor.js`,
  through arduino-cli's monitor: a System node's board matched by its USB id, a terminal's link's board, or a port given).

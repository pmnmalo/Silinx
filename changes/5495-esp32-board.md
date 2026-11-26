In short:

- **The ESP32 DevKitC drawn:** Emulate System shows an ESP32 node's board, Espressif's DevKitC V4 as it is, each GPIO
  of its two headers lit by its level; the Circuit editor's Boards have it too, its pins where the real headers are.

In detail:

- **The ESP32 DevKitC's drawing (#5495):** `web/js/emulator-esp32.js` draws the DevKitC V4 seen from above (its black
  PCB, its ESP32-WROOM-32 module and antenna, its micro-USB socket, its EN and BOOT buttons, its USB-UART chip and
  regulator, its power LED, J2 and J3 with each pin's silkscreen name); the System Emulator shows it with each GPIO's
  level (`emulationBoards`: its pins watched, no LED of its program's; the MCP's `simulate` with controls gives its
  board's pins), and the circuit editor draws its part with it.
- **The ESP32 DevKitC as a circuit's part (#5495):** `core/circuit-boards.js`'s `esp32-devkitc`: its 38 pins where its
  headers are (J2 and J3 1 inch apart, one on each breadboard), its GPIOs the board's at 3.3 V (34 to 39 inputs only),
  its 5V, 3V3 and GND powering the breadboard, the flash's pins and EN not connected; its details and their Portuguese.

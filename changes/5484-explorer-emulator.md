In short:

- **The Explorer 16/32 in Emulate:** a System's PIC24 board is drawn in the System Emulator: its LCD shows what the
  program writes, its LEDs light, its buttons S3 to S6 can be pressed, and its potentiometer and temperature sensor set.

In detail:

- **The System Emulator's Explorer 16/32 (#5484, part 2):** `core/system-emu-explorer.js`, a PIC24 node's board to
  emulate (its buttons S3 to S6 through the node's pins, a button whose pin a link drives left out; R6 and the
  TC1047A on the board's model) and what it shows over a window (each LED's share of it lit, the buttons held, R6 and
  the temperature, the LCD's two rows); `web/js/emulator-explorer.js`, Silinx's own drawing of the board (its LCD, its
  PIM, its LEDs D3 to D10, its buttons, R6's slider, the temperature, its USB ports, mikroBUS sockets and PICtail
  edge), Portuguese. The MCP's `simulate` with `controls` presses its buttons (`S3`, `on`), sets `R6` (0 to 1) and the
  `TC1047A` (°C), and says what it shows (its LEDs, buttons, R6, temperature and LCD). The standalone and browser
  editions run a PIC24 in the System's worker (silinx-pic24 bundled), now tested.

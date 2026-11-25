In short:

- **A System's Emulate tree shows only emulation:** each node has its Emulate Node and no source file (a microcontroller's
  `.hex`, a circuit's file) or Compile Firmware, which stay in Design and Implement. Emulate System and Emulate Node have
  an icon of their own, no longer an Arduino's board.

In detail:

- **Emulation only in a System's Emulate tree (#5597):**
  - Its nodes' rows keep the emulation's options and runs. A microcontroller's firmware file and Compile Firmware, and a
    circuit's file, are gone from it (`web/js/system-emulate-ui.js`).
  - The `emulate` icon (`web/js/icons.js`) is used by Emulate System and Emulate Node there and on the ISE style's rows
    (`web/js/system-processes.js`), so they don't look like an Arduino node's row.

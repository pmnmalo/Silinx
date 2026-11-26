In short:

- **An Arduino programmed from the browser:** an Arduino Uno's or Nano's firmware is loaded over Web Serial (Chrome,
  Edge) through its bootloader, then read back and compared: in the browser edition's Program Node and Program All, and
  in the local server's Program Node when it does not see the board (Web Serial… in Choose the Board).

In detail:

- **An Arduino node's firmware over Web Serial (#5448):** the STK500 version 1 protocol of Optiboot (`core/stk500.js`:
  reset by DTR and RTS, sync, the chip's signature, each page loaded, programmed, read back and compared, the bootloader
  left), tested against a simulated Optiboot (`core/stk500-sim.js`) packet by packet and on a fake Web Serial port, a
  wrong signature, a byte that does not take and a wrong answer refused with their messages;
  `web/js/system-serial-program.js` and Program All / Program Node (`web/js/system-program-ui.js`). The MCP's
  `program_board` with a node programs an Arduino through the local server's arduino-cli, as before.

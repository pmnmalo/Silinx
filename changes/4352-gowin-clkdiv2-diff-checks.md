In short:

- **Gowin: clear messages for what nextpnr cannot build:** a CLKDIV2 driving anything but a CLKDIV, and a TLVDS_IOBUF, are
  errors naming the cell (nextpnr stopped with no message); a differential tristate's enable, dropped by nextpnr, is a
  warning.

In detail:

- **The Gowin's checks before Place & Route (#4352):** silinx-fpga's `gowin-checks.js` (its fragment has the details).

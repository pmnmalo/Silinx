In short:

- Program FPGA with openFPGALoader, djtgcfg or xc3sprog asks for the device the Program view shows selected: its
  "position N" (iMPACT's, from 1) was passed to them as is, one past the device (the Nexys2's FPGA asked as its PROM,
  a one-device chain's FPGA as a device it does not have).

In detail:

- **The JTAG chain position counted as each programmer counts (#4940):** a request's position, the Program view's and
  now program_board's (its `position`, from 1), is iMPACT's numbering; `server/programmer.js` `toolPosition` turns it
  into the tool's in one place: iMPACT's `-p` as it is, openFPGALoader's `--index-chain`, djtgcfg's `-i` and
  xc3sprog's `-p` from 0. A position outside 1 to 32 refused. The boards' programmer defaults were already the tools'
  own, unchanged; a Zynq-7000's openFPGALoader still runs with no `--index-chain` (#4683), adepttool and the PROM's
  operations take no position.

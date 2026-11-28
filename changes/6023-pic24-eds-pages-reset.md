In short:

- The Board Emulator's PIC24 runs a program that uses the RAM above 0x7FFF before it sets DSRPAG and DSWPAG (an
  assembly program, a variable XC16 placed there) as the device does, with no address error trap.

In detail:

- **A PIC24's DSRPAG and DSWPAG 0x0001 from the reset (#6023):** silinx-pic24 cleared them to 0, so a program's first
  read or write in the EDS window trapped; its fragment is in `packages/silinx-pic24/changes/`.

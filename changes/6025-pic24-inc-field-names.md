In detail:

- **uart-fpga-pic24 built alike by XC16 and Silinx (#6025):** its `lcd_uart.asm` sets the LCD's EDS page through
  `_DSRPAG` and `_DSWPAG`: to xc16-as, `DSRPAG` is the .inc's bit field's position, 0, so XC16's build wrote W0 and its LCD
  stayed blank. Silinx's PIC24 assembler reads such names as xc16-as does and warns of them (its fragment is in
  `packages/silinx-pic24/changes/`); the example's `.hex` is unchanged.

In short:

- The assembler reads `DSRPAG`, `DSWPAG`, `TBLPAG`, `DISICNT` and the other names XC16's .inc gives a register's bit field
  as xc16-as does, and says so where a program uses one: the register is `_DSRPAG`. A source builds the same with
  Silinx's assembler and with XC16.

In detail:

- **A name that is a register and its bit field (#6025):** XC16's `p24FJ1024GB610.inc` defines 27 registers' bit fields
  of the register's own name (`DSRPAG`, the field DSRPAG<9:0>, its position 0), which xc16-as reads before the linker
  script's register, so `mov w0, DSRPAG` is `mov w0, 0x0` (0x880000) to XC16; `assemble` took the register (0x880190).
  Those names (`FIELD_NAMES` in `gb610-names.js`, XC16 2.10's) are now their constant, each use warned of with the
  register's address, an `.equ` or a symbol of the name its own; every register is also `_NAME`, the linker script's.
  Found by XC16's build of uart-fpga-pic24's `lcd_uart.asm` (#6019), which now writes `_DSRPAG` and `_DSWPAG`.

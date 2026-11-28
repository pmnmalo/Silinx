In short:

- A PIC24 node's program turns the JTAG port off (`#pragma config JTAGEN = OFF`): on the Explorer 16/32 the LEDs D3,
  D4, D7 and D8 light as the drawings say. The emulator shows them dark, with a warning, in a program that leaves the
  JTAG port on, as the board does.

In detail:

- **The PIC24's JTAG port (#6027):** an erased FICD leaves the PIC24FJ1024GB610's JTAG port on, and on the 100-pin
  device it takes RA0, RA1, RA4 and RA5 (TMS, TCK, TDI, TDO), four of the Explorer 16/32's LEDs. The node's `main.c`
  made from its drawings (`pic24Main`, `core/reactive-c-pic24.js`) now writes `#pragma config JTAGEN = OFF`, and the
  uart-fpga-pic24 example's `lcd_uart.asm` `config __FICD, JTAGEN_OFF` (its `.hex` reassembled). silinx-pic24 reads
  FICD's JTAGEN: while it is on, the port drives none of the four pins and says so once a pin.
- **The assembler's configuration words in the .hex (#6037):** `assembleProgram` wrote each `config` word at half its
  address, so `config __FWDT, FWDTEN_OFF` left the device's watchdog on (uart-fpga-pic24's `lcd_uart.hex` too, now
  rebuilt). They are now at XC16's addresses.

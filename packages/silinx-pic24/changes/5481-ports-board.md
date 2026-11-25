In detail:

- **The I/O ports and the Explorer 16/32's LEDs and buttons (#5481):** gpio.js, PORTA to PORTG of the 100-pin
  device (its 84 port pins): TRIS, PORT (its reads the pins' levels, its writes the latch's), LAT, ODC (an open drain),
  ANS (an analog pin reads 0: RD6 and RD7, S3's and S6's, and RA6 and RA7 are analog at reset), the weak pull-ups and
  pull-downs (IOCPU, IOCPD), the interrupt-on-change (IOCP, IOCN, IOCF, IOCSTAT, PADCON's IOCON, IRQ 19); a pin's level
  from a peripheral's output, its latch, outside, its pull-up, or floating; the outputs' changes are `Pic24Node`'s
  outputs, an input event a pin's level. explorer1632.js, the board with the PIC24FJ1024GB610 PIM (from its schematic
  and the PIM's information sheet): the LEDs D3–D10 on RA0–RA7, the buttons S3 (RD6), S4 (RD13), S5 (RA7, with D10)
  and S6 (RD7) with their pull-ups, and the pins of the potentiometer, the TC1047A, the USB-UART, the LCD and the
  EEPROM for the next peripherals. Not modelled: the pins' electrical levels, the input synchronisation's delay, the
  PMP's TTL buffers. Tests: pic24-gpio (the reset values, outputs and inputs, ODC, ANS, the pull-ups, the IOC, the
  board, a program lighting D3 while S3 is held through a `Pic24Node`).

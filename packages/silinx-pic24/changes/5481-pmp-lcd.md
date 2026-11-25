In short:

- **The PIC24 emulator's Explorer 16/32 board:** its LEDs and buttons, its potentiometer and temperature sensor, its
  USB-UART, and its character LCD, driven by a program as on the board.

In detail:

- **The EPMP and the Explorer 16/32's character LCD (#5481):** pmp.js, the EPMP's master mode: the CPU's accesses of
  the EDS above the RAM become bus cycles on its chip selects' regions (PMCS1BS, PMCS2BS, RADDR), a byte a cycle (a
  word two), the PMP interrupt (IRQ 45) with IRQM 01; a device on the bus answers its cycles. lcd.js, an
  HD44780-compatible 16x2 LCD of the package's own: its instructions, the DDRAM's two lines and the display's shift,
  the CGRAM, the busy flag and the instructions' times (37 µs, 1.52 ms), a write while busy ignored and said, the
  4-bit mode. The board's LCD on the PMP (RS on PMA0, no chip select). Not modelled: the strobes' waveforms on the
  pins, the wait states' timing, PMACK, the 4- and 16-bit ports, the multiplexed addresses, the slave modes; the LCD's
  power-on delay and its ROM's codes above 0x7F. Tests: pic24-lcd (the LCD's instructions, busy flag, 4-bit mode and
  CGRAM; the EPMP off, its word cycles and interrupt; a program printing two lines polling the busy flag).

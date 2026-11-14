In short:

- **The Digilent Arty S7 and Zybo Z7.** Two new boards in New Project and Design Properties: the Arty S7 (-50 and -25,
  a Spartan-7) and the Zybo Z7 (-20 and -10, a Zynq-7000's programmable logic), built by AMD Vivado. An example's
  display, LEDs and switches the board lacks are on its Pmods.

In detail:

- **The Arty S7 and the Zybo Z7 (#3895).** core/boards-vivado.js: their variants, their pins from Digilent's master
  XDCs (the Basys 3's commit): the Arty S7's 12 MHz oscillator, 4 LEDs, 2 RGB LEDs, SW0..SW2 (SW3 and the 100 MHz
  oscillator are on bank 34 at 1.35 V: left out), 4 buttons, the USB-UART, Pmods JA..JD; the Zybo Z7's 125 MHz clock,
  4 LEDs, RGB LED LD6, 4 switches, 4 buttons, Pmods JA, JC, JD, JE (JB and LD5 are the Z7-20's only; its UART is the
  PS's). Their Pmods are headers (#3709): every example's ports get a pin, as Vivado's write_bitstream requires. The
  Arty S7's XDC configuration is its master XDC's (SPIx4 at 50 MHz); the Zybo Z7's has none (a Zynq's PL).
  test/vivado/examples.test.js builds the examples on them too (SILINX_VIVADO_BOARDS picks the boards): all ten routed,
  timed and written as bitstreams by Vivado ML Standard 2025.2, with no error; their known findings recorded
  (test/vivado-examples-config.mjs): ZPS7-1 on the Zybo Z7 (a Zynq's PL with no PS), vga's pace counter unused at the
  Arty S7's 12 MHz, blinky's debouncers dead at the Zybo Z7's 125 MHz (#3922). README's Vivado section.

In short:

- A program that uses the RAM above 0x7FFF before it sets DSRPAG and DSWPAG (an assembly program with no start-up
  code, a variable XC16's linker placed there) runs as on the device: no address error trap.

In detail:

- **DSRPAG and DSWPAG 0x0001 from the reset (#6023):** the PIC24FJ1024GB610's EDS window, 0x8000-0xFFFF, is the RAM
  above 0x7FFF from the reset on (DS30010074's register map); `CPU.reset()` cleared both pages to 0, so the first read or
  write there took an address error trap. Found by XC16's build of uart-fpga-pic24's `lcd_uart.asm` (#6019); a test
  runs its instruction words after a power-on and after an MCLR reset.

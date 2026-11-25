In short:

- **The uart-pic24 example:** a System for the PIC24 course: the Explorer 16/32 and a Basys2 over UART, the PIC24
  showing on its LCD what the FPGA echoes and sends; it runs in Try it and Emulate.

In detail:

- **The System example uart-pic24 (#5484, part 4):** the Explorer 16/32's firmware `pic/lcd_uart.asm` (its title on
  the LCD, "Hi from PIC24!" sent over UART2 on the USB-UART's pins through PPS at 9600 baud, each byte received shown
  on the LCD's second row while it sends, the last one on its LEDs) and its `.hex`, assembled by the tests' assembler;
  the FPGA's module the uart-avr example's; listed after the other System examples (`core/examples.js`), in New
  Project and the MCP's `list_examples`. docs/SYSTEMS.md.

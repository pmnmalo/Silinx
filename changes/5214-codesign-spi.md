In short:

- Co-design: SPI links between an Arduino (the master) and an FPGA (the peripheral), drawn in the System editor with
  **+ SPI**, simulated with Try it, each transfer's bytes in the console; the **spi-avr** example.

In detail:

- The System editor's **+ SPI** on an Arduino (its board's SPI: SCK D13, MOSI D11, MISO D12, SS D10) and on an FPGA node
  (its module's sck, mosi, miso and ss ports, found by their names), its properties (the ports, its SCK rate, its mode),
  its links dotted, a new link named spi; the MCP's simulate of a System says each SPI link's transfers; the spi-avr
  example (an FPGA peripheral, examples/spi-avr/src/spi_echo.vhd, and the Arduino's firmware/spi.asm), listed after
  uart-avr; the test assembler's dec and brne; the user's guide (#5214).

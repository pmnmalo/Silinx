In short:

- Co-design: I²C links between an Arduino (the master, its Wire) and an FPGA (the peripheral, its SDA an inout port),
  drawn in the System editor with **+ I²C**, simulated with Try it, each transfer in the console; the **i2c-avr** example.

In detail:

- The Arduino's TWI simulated at its pins (core/system-sim-avr-twi.js: each START, address, byte and STOP its program asks
  for made SCL's and SDA's waveforms at TWBR's rate, SDA read at each SCL high); an FPGA node's pad a link's pin (what
  its design drives on it, released where its enable is 0: the compiled engine's inout ports, #4709); an I²C link three
  wires (SCL, and SDA each way, pulled up); its decoder (each transfer's address, read or write, bytes and ACKs; a SCL
  faster than said, an address not acknowledged: warnings) and its check (one rate, SDA an inout port, the 5 V
  warnings); the System editor's **+ I²C** on an Arduino and on an FPGA node (its scl and sda found by their names), its
  properties, its links dashed, a new link named i2c; the MCP's edit_system and simulate of a System; the i2c-avr
  example (an FPGA peripheral at 0x42, examples/i2c-avr/src/i2c_leds.vhd, and the Arduino's firmware/i2c.asm), listed
  after spi-avr; the user's guide (#5214).

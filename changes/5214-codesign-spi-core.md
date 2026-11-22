In detail:

- Co-design's SPI links, their core: the System document's SPI interface (an FPGA node's four ports, the peripheral; an
  Arduino's board's SPI, the master; its SCK rate and mode), their check (the master and the peripheral, one rate, one
  mode, the 5 V warnings), the plan's four wires (each at a sixteenth of SCK's period; SS pulled up while floating), the
  AVR's SPI master as pins (core/system-sim-avr-spi.js), the decoder's transfers (MOSI and MISO bytes) in the run's
  report and the console's lines, a SCK faster than said a warning; edit_system and check_system with it (#5214).

In short:

- **Circuits:** an SD card module on SPI among the Outputs, with an SDHC card in it: an Arduino's SPI initialises it,
  writes a block and reads it back; its state and the blocks written shown while trying it.

In detail:

- An SD card on SPI, a microSD module with a 32 MB SDHC card, as a circuit's part (#5477, part of #3902):
  core/circuit-sd.js; SPI mode 0 bit by bit on SCK's edges, MISO released while CS is high; the SD protocol's SPI
  commands (after 74 clocks with CS high: CMD0, CMD8 and its echo, CMD55 + ACMD41 idle then ready, CMD58's OCR, CMD16,
  CMD13, CMD17 a block read with its token and CRC16, CMD24 a block written with its data response and busy), CMD0's and
  CMD8's CRC7 checked, R1's bits for an illegal command, an address past the card, a wrong length; its blocks kept while
  it runs (unpowered too). Its HDL (core/circuit-hdl-sd.js, simulation only): the same protocol, its MISO bit for bit the
  live one's and what it does said (ready, a block written, a block read) in VHDL and in Verilog, no lint warnings; it
  keeps 4 blocks. Drawn as the module (web/js/circuit-draw-sd.js, CSS tokens): its board, its socket and card, its state,
  the blocks written and its last access while trying it, in the interface's language (the circuit editor drawn again
  when the language changes). Its checks (not powered, SCK, MOSI, CS driven by nothing, joined to nothing), Part info,
  the Parts panel's Outputs, Portuguese; left out of the KiCad export. A System's circuit node, its emulator and the
  MCP's simulate say it, each block written with its first bytes; simulate_drawing says its state; circuit_parts lists
  it. The tests' AVR assembler knows add, adc and eor. Tests: circuit-sd (CRC7 and CRC16 against their known values, the
  protocol byte by byte and its refusals, its SPI side, in a circuit, its HDL in VHDL and Verilog bit for bit the live
  one's, an Arduino's SPI writing a block and reading it back through a System), mcp-circuit, mcp-system, web-i18n,
  circuit-coverage, kicad-library; the UI's circuit-sd, both interfaces and Portuguese, and the Parts panel's counts
  (Fixes #5477)

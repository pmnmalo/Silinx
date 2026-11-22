In detail:

- A co-design's register map, its core (core/regmap.js: the format of `<name>.regs.json`, its bus, SPI or I²C at its
  address, and its registers, each its address, width, access rw, ro or wo, reset and strobe; its check): its FPGA side
  generated in VHDL and in Verilog (core/regmap-hdl.js: the registers behind an SPI or I²C slave, its lines sampled with
  the clock, I²C's SDA an inout port), its program side (core/regmap-c.js: the Arduino's header, the addresses and each
  register's read and write through SPI or Wire) and its decoder (core/regmap-decode.js: a link's transfers as register
  accesses); the map in the project, its editor and its example come next (Part of #5288).

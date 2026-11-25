In short:

- **Verilog `time` variables keep 64 bits:** a `time` past 2^32 (4.29 s at 1 ns) no longer wraps, nor reads back negative.

In detail:

- **A Verilog `time` variable is an unsigned 64-bit reg (#5467):** as IEEE 1364-2005 4.8 says; it was an integer's 32
  signed bits, so 6000000000 read 1705032704 and `t * 1000000` of 3000 read -1294967296
  (`packages/silinx-hdl/src/verilog/parser.js`).

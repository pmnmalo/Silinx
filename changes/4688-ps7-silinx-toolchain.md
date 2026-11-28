In short:

- A Zynq board's PL top with its processing system (the PS7) built by the Silinx toolchain, no Vivado needed.

In detail:

- **The PS7 in the Silinx toolchain (#4688, part 3):** a Zynq PL top with the PS7 (core/zynq-pl-top.js, `fixedIo: false`)
  is built end to end by the Silinx toolchain:
  - Silinx's front end knows the PS7 and the BIBUF (silinx-hdl's UNISIM models);
  - Yosys keeps the PS7 as its cell;
  - nextpnr's xilinx arch places it in its PSS2 tile and routes M_AXI_GP0 and FCLK_CLK0 into the fabric;
  - Project X-Ray's xc7z020 database writes the bitstream.
  The generated VHDL top uses `library UNISIM`, as Vivado's designs do. The investigation is in #4688; Vivado's build of
  the same top and the board check are #5985. Tests: `test/zynq-pl-build.test.js` (the PS7's model; the top synthesized,
  placed, routed and written as a bitstream in VHDL and Verilog with no error and no warning, the PS7's 32 read-data bits
  routed into its tile).

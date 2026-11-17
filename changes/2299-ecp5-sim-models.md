In short:

- **ECP5 designs simulate.** A design for the ULX3S that instantiates the ECP5's primitives (EHXPLLL, OSCG, TRELLIS_FF,
  CCU2C, DP16KD, MULT18X18D, the Diamond flip-flops…) now elaborates, simulates and synthesizes, from Verilog or from VHDL
  (`library ecp5u;`), and the ECP5 synthesis's netlist simulates in place of the design.

In detail:

- **Simulation models of the ECP5 primitives (Part of #2299):** Silinx's own functional models, from Yosys's
  techlibs/ecp5/cells_sim.v and Lattice's guides (packages/silinx-hdl/src/ecp5-prims.js, ecp5-bram.js, ecp5-dsp.js): LUT4, LUT2,
  PFUMX, L6MUX21, CCU2C, INV, VLO, VHI; TRELLIS_FF (CEMUX, CLKMUX, LSRMUX, SRMODE, REGSET, LSRMODE) and the Diamond flip-flops
  FD1P3* / FD1S3* / IFS1P3* / OFS1P3*; TRELLIS_DPR16X4, DPR16X4C, TRELLIS_RAM16X2; TRELLIS_IO, IB, OB, OBZ, BB and their pull
  variants, OBCO, ILVDS, OLVDS, IDDRX1F, ODDRX1F; DCCA, DCSC, OSCG (310 MHz / DIV), EHXPLLL (its four outputs' frequencies and
  phases as ecppll sets them, LOCK, RST), GSR, SGSR, PUR, USRMCLK; DP16KD (the widths 1 to 18 on each port, the 36-bit pseudo
  dual port, the write modes, the output register, the resets, INITVAL) and MULT18X18D (signed and unsigned, its registers).
  primitiveSources gives a design the ECP5 library when it instantiates one of them (its LUT4 and INV by their pins: Z) or
  uses `library ecp5u`; the netlist cells run natively (native-lattice.js); the open synthesis keeps them as the ECP5's
  cells. Tests: ecp5-prims, ecp5-sim-clocks (each primitive against values computed in the test, in Verilog and VHDL; the
  PLL against Project Trellis's ecppll), ecp5-netlist (every example's ECP5 post-synthesis netlist passes its test bench as
  its RTL does, no warning), mcp-ecp5 (check_syntax, simulate and run_process on a design with EHXPLLL and OSCG),
  hdl-boundary, silinx-hdl-package.

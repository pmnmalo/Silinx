In short:

- **iCE40 designs simulate.** A design for the iCEBreaker that instantiates the iCE40's primitives (SB_PLL40_PAD,
  SB_HFOSC, SB_IO, SB_RAM40_4K, SB_MAC16…) now elaborates, simulates and synthesizes, from Verilog or from VHDL (`library
  sb_ice40_components_syn;`), and the iCE40 synthesis's netlist simulates in place of the design.

In detail:

- **Simulation models of the iCE40 primitives (Part of #2299):** Silinx's own functional models, from Yosys's
  techlibs/ice40/cells_sim.v and Lattice's guides (packages/silinx-hdl/src/ice40-prims.js, ice40-ram.js, ice40-dsp.js):
  SB_LUT4, SB_CARRY, the 20 flip-flops (SB_DFF, E, SR, R, SS, S, ESR, ER, ESS, ES and their falling-edge SB_DFFN… twins), SB_IO,
  SB_GB_IO and SB_IO_OD (PIN_TYPE's input, output, enable and DDR registers), SB_GB, SB_WARMBOOT, SB_FILTER_50NS, the LED
  drivers SB_RGBA_DRV, SB_RGB_DRV and SB_LED_DRV_CUR; the PLLs SB_PLL40_CORE, PAD, 2_PAD, 2F_CORE and 2F_PAD (the reference ×
  (DIVF + 1) / (DIVR + 1) / 2^DIVQ, PLLOUT_SELECT, BYPASS, RESETB, LOCK), SB_HFOSC (48 MHz / 2^CLKHF_DIV) and SB_LFOSC (10 kHz);
  the block RAMs SB_RAM40_4K and its NR / NW twins (the four widths of WRITE_MODE / READ_MODE, MASK, INIT_0 … F), the
  UltraPlus's SB_SPRAM256KA and SB_MAC16 (its multipliers, adders, accumulators and registers). primitiveSources gives a
  design the iCE40 library when it instantiates one of them or uses `library sb_ice40_components_syn` (lattice-libs.js); the
  netlist cells run natively (native-lattice.js), as UNISIM's do; the open synthesis keeps them as the iCE40's cells. Tests:
  ice40-prims, ice40-sim-clocks (each primitive against values computed in the test, in Verilog and VHDL; the PLL's frequency
  against IceStorm's icepll), ice40-netlist (every example's iCE40 post-synthesis netlist passes its test bench as its RTL
  does, no warning), mcp-ice40 (check_syntax, simulate and run_process on a design with a PLL and the oscillator),
  hdl-boundary, silinx-hdl-package.

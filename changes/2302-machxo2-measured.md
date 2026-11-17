In detail:

- **The MachXO2 measured (#2302):** `scripts/machxo2-measure.mjs` builds each example on a MachXO2 (or MachXO3)
  part with the open tools, outside the IDE: the Silinx toolchain's flat Verilog (as a ULX3S project) through Yosys's
  `synth_lattice -family xo2` (`xo3`), nextpnr-machxo2 and ecppack, YoWASP's `@yowasp/nextpnr-machxo2` 0.11.825 (a
  development dependency), each bitstream read back by ecpunpack the same, and prints a table per part. Every example
  builds on the LCMXO2-1200HC-4TG100C and the LCMXO3LF-6900C-5BG256C with no warning, seeds 1 to 5, the board's 25 MHz met;
  the block and distributed RAM, the global clock buffer, the oscillator (OSCH) and the PLL (EHXPLLJ) too. The clock is
  given a pin: nextpnr-machxo2 fails to route a global clock from a pin it placed itself (YosysHQ/nextpnr#1236).
  `test/machxo2-measure.test.js` (the script's parts; gates, blinky, OSCH and EHXPLLJ built on the 1200HC); the results in
  docs/TOOLCHAIN.md. The MachXO2 is not a family of Silinx yet.

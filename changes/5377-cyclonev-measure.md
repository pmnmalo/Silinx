In detail:

- **The Cyclone V measured with the examples (part of #5377):** scripts/cyclonev-measure.mjs synthesises each example's
  flat Verilog (the Silinx toolchain's synthesis, as a ULX3S project) through Yosys's synth_intel_alm -family cyclonev, in
  the Silinx toolchain's own @yowasp/yosys, and prints its Cyclone V cells: adaptive LUTs and their carry chains,
  flip-flops, MLABs, M10Ks, DSPs, I/O. Every example maps with no warning. The place and route and the bitstream are not
  measured: nextpnr-mistral (with Mistral's chip database and .rbf) has no WebAssembly build, YoWASP publishes none, the
  next step. test/cyclonev-measure.test.js: the script's parts, then gates and blinky. docs/TOOLCHAIN.md: the results.

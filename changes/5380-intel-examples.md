In short:

- **The examples on the Intel boards (#5380):** every example (gates … lock) on the DE10-Lite, DE0-CV, DE1-SoC,
  DE10-Nano, DE0-Nano and DE2-115, its constraints a QSF of the board's pins, built by Intel Quartus Prime; the user's
  guide says how.

In detail:

- **The examples on every Intel board, phase 5 of the Intel roadmap (#5380):** INTEL_TARGETS in test/examples-lib.mjs (the
  six DE boards). Each example's constraints on each board: every port bit on a pin of the board, its I/O standard the
  board's, the 50 MHz clock, Check Constraints clean; the switches, LEDs and KEYs the board's own (BTN_LOW: the KEYs
  active low), the 4-digit display (seg, an, dp) on the GPIO header, the HEX displays not used yet. Each example's project
  for each board elaborates with the board's generics, and Quartus's build folder for it is made with no warning but
  gates' (no clock: nothing for the Timing Analyzer to check), its run.sh making the board's .rbf or .svf. Quartus itself
  is not run by the tests (not on the CI's runners nor the ISE machine), nor the Cyclone V's flow of the Silinx toolchain
  (#5377: no nextpnr-mistral for WebAssembly yet). The user's guide: the Intel boards with Intel Quartus Prime
  (docs/user/en/toolchains.md). Tests: examples-intel.

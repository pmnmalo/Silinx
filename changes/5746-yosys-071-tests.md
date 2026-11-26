In detail:

- **Yosys 0.71's results in the tests #5716 did not select (#5746):** six tests on `main` still expected Yosys 0.70's.
  Each is updated to 0.71's result, with 0.70's value in a comment. None of the six is flaky, and Silinx's own
  results are still right:
  - ucf: Yosys's JSON names an escaped VHDL port as it is (`\Mixed\`), and the pads are still XST's names;
  - s6-timing-flow: the critical path's logic may be a LUT in the setup arc of its own slice;
  - gatemate-measure and machxo2-measure: blinky's sizes;
  - the UI tests sim-emu (the combinational loop through `a`) and open-toolchain (pong's Technology Schematic, 1068
    cells in 21 blocks, pressL's flip-flop `pressL_FDRE`).

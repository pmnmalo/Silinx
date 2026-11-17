In detail:

- **The tests that measure blinky follow its new debounce (#4424):** blinky's two 2-bit debounce counters (#4377) in place
  of 22-bit ones make it 40 flip-flops and 22 carry cells smaller on the LCMXO2-1200HC (`test/machxo2-measure.test.js`:
  114 LUTs, 92 flip-flops, 42 carry cells), and moved speed_ctrl.vhd's `state_register` process to line 101
  (`test/twr-paths.test.js`).

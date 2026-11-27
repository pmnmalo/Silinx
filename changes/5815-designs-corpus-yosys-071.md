In detail:

- **The designs corpus's expectations re-recorded with Yosys 0.71 (#5815):** `test/designs-corpus/expected.json` and its
  README's table from the first nightly run on 0.71 (the stages' status unchanged; 66 designs' sizes and periods, the
  synthesis's warnings). No pass of Yosys made the differences: 0.71 hands ABC the same netlist as 0.70 (the same cells,
  the same graph), named and ordered otherwise, and ABC's mappings and Silinx's choice among its candidates follow that
  order (YosysHQ/yosys#6148). 49 designs changed size, 24 larger and 25 smaller (geometric mean +0.8 % slices, −0.3 %
  critical path); secworks-aes +25 % slices, serv +22 %, vtr-stereovision3 +23 %, epfl-max −9 %. Its latches' warnings
  name their process by its line (`$picorv32_syn.v:409$proc`); itc99-b05's and neorv32's are gone: process variables
  written before every read, which Yosys 0.71 no longer takes for latches (no latch in either netlist).

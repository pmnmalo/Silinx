In detail:

- **No hold violation on the Zybo Z7-20's stopwatch, the 7-series' clock tree balanced (#4878):**
  `@silinx/nextpnr-himbaechel-xc7` 0.5.0 (pmnmalo/nextpnr-spartan#57). Its chip databases gave every node of the global
  clock's tree the timing fit's 525.7 ps, so a register one clock region further, two nodes more, was 1.05 ns late:
  stopwatch's debouncer had a register pair across a region's edge with a hold slack of −0.04 ns. The silicon's tree is
  balanced; its spine (the BUFG tiles', the rebuffers', the CLK_HROW's, the HCLK's leaves) is now of the least delay, the
  sinks' skew none of its own. The examples' tables on the 7-series' boards measured again (micro80 112.9 MHz on the
  Basys 3, 113.8 on the Nexys A7; the Arty Z7-20's clock 134.0); the Zybo Z7-20's expected warnings without the hold one.

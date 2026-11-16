In detail:

- **The 7-series: a 5LUT feeding another slice's CYINIT, its regression test (#3746):** nextpnr's xilinx packer took
  a LUT pair's 5LUT whose only user was another slice's CARRY4 (its CYINIT) as feeding its own carry chain inside the
  site, so the placer put a flip-flop in the 5FF beside it, whose Q needs the same AMUX..DMUX output, and router 1
  (the browser's, when router 2 runs out of its memory) never finished micro80. The fork's fix (only the cluster's own
  CARRY4, on S or DI, counts) is in `@silinx/nextpnr-himbaechel-xc7` since 0.2.0. `test/nextpnr-xc7-cyinit.test.js`
  holds it: a small design with that LUT pair, its flip-flop locked in that 5FF refused (it was taken, and router 1
  never finished), the design placed by nextpnr routed by router 1, and micro80 routed by router 1 on the Basys 3
  (seed 3; seed 1 routes too, in far longer).

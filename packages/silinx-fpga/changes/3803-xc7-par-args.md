In detail:

- **The 7-series' nextpnr arguments in the package's API (part of #3803):** `xc7ParArgs` of open-flow-xc7.js, the
  arguments Place & Route runs nextpnr with (the same as before), exported from index.js with `nextpnrXdc`,
  `portBits` and `xc7BscanCells` (a BSCANE2 as Place & Route gives it to nextpnr), for Silinx's
  scripts/xc7-timing-vivado.mjs, which runs nextpnr again with them for its placement (`--placement`: Vivado routing
  and timing it).

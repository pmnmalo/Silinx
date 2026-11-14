In detail:

- **The 7-series' DSP48E1 timing, fitted to Vivado's (part of #3875).** `scripts/xc7-timing-fit.mjs`'s table for the
  nextpnr fork's chip database now has the DSP48E1's arcs with no register (its buses by name: A -> P 3,841 ps,
  B -> BCOUT 735 ps…, from Vivado's SDF of stopwatch, `packages/silinx-fpga/research/xc7/timing-fit.json`), the arcs the
  fork's xc7 0.1.2 left out: a path through a DSP48E1 was not timed, so stopwatch's estimate was twice Vivado's. The
  fork's `silinx` branch times the DSP48E1 by these arcs (its `timing_fit.py`, which the test holds the table to); the
  estimate changes once a release of it is pinned here.

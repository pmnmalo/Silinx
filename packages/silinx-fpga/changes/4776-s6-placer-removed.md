In short:

- **The Spartan-6's own placer removed:** with Silinx's Map (spec `s6Map` `silinx`) nextpnr places the design too; the
  pads, the global buffers and the BSCANs are fixed by Silinx's rules first, as before. The spec option `hardByNextpnr`
  is gone (nextpnr places the block RAMs and DSP48A1s).

In detail:

- **fpga/s6/place.js, place-moves.js, place-check.js and place-timing.js removed (#4776):** Silinx's annealing placer of
  the Spartan-6, a second placement engine after nextpnr's, used only before nextpnr: with Silinx's Map, and with
  nextpnr's Map for the ports without a LOC (#4374). `fpga/s6/fixed-sites.js` keeps its rules, its errors and its warning
  without the annealing: the I/O buffers with a LOC on their pads (bonded, one a pad, one VCCO a bank), a global buffer
  driven by a pad on that pad's dedicated BUFGMUX (a clock without a LOC on a free GCLK pad), the BSCANs on their JTAG
  chains' sites, and the ports without a LOC on the first free bonded pad of their bank's VCCO (nextpnr puts a site
  cell's I/O buffer on unbonded pads too, #4950). With nextpnr's Map, nextpnr places the ports without a LOC itself (the
  pad LOCs `packInput` took, its `padLocs`, removed): a design of 62 such ports takes about 35 s a seed. `S6_ESTIMATE`
  moved to `fpga/s6/timing.js`, its one user; `S6_HARD_BY_NEXTPNR`, `padFits`, `rng` and `crossing` removed; the
  research scripts `compare-place.mjs` and `place-xdl.mjs` with them.

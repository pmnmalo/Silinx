In short:

- **The GateMate:** Cologne Chip's CCGM1A1 and CCGM1A2, a family of the toolchain: Yosys's `synth_gatemate`,
  nextpnr-himbaechel-gatemate and gmpack (Project Peppercorn, YoWASP's `@yowasp/nextpnr-himbaechel-gatemate`, an optional
  dependency), its constraints CCF.

In detail:

- **The GateMate's back end (#2431):** src/open-flow-gatemate.js (`synth_gatemate -luttree -nomx8`: this nextpnr refuses Yosys's
  CC_LUT3/4 and CC_MX8; place and route into Project Peppercorn's text configuration, open/routed.cfg; the bitstream gmpack's
  `<top>.bit`; nextpnr's report as the utilization and each clock's Fmax, the clock by its port's name), src/ccf.js (Cologne
  Chip's CCF: NET, Pin_in, Pin_out, Pin_inout, Loc and the settings after `|`; a clock's period in a comment given to nextpnr in
  an SDC), io.nextpnr.gatemate (gatemateIo, nextpnrGatemateNode); GATEMATE_PARTS, GATEMATE_STEPS, CCF exported.
- **The CCGM1A2 routed by router1 with no CPE's CP lines (#2431):** nextpnr's router2 throws on every design on it, one AND
  gate too: its state for every wire takes 2.3 GB on the CCGM1A1 and twice as much on the CCGM1A2, past WebAssembly's 4 GiB (a
  `std::bad_alloc` nextpnr does not catch); router1's routes through the CP lines write a CPE's C_SEL_P twice ("Trying to add
  value to already assigned word"); `--router router1 --vopt no-cpe-cp` builds, slowly (pong in about 12 minutes).
- **A crash of nextpnr's placed and routed again (#2431):** a WebAssembly trap with no ERROR: line (nextpnr-himbaechel-gatemate
  0.11.825 after the placement of some designs: uart's with seeds 1 and 2, `memory access out of bounds`) runs nextpnr again
  with the next seed, up to three times, each a warning.

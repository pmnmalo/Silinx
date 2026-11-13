In short:

- **Spartan-6: nextpnr's Map alone:** Process Properties has no Map (Spartan-6) field any more: nextpnr packs and places
  every Spartan-6 design, a project saved with Silinx's Map too.

In detail:

- **Silinx's Spartan-6 placer removed, nextpnr's Map the one Map (Fixes #3140):** after nextpnr's Map became the default
  (#3139's parity), `packages/silinx-fpga/src/fpga/s6/place.js`, `place-moves.js`, `place-check.js`, `place-timing.js`,
  `pad-paths.js` and `fpga/place-common.js` (the placers' common parts, the Spartan-6's alone since #2137) go, with Silinx's
  own placement of its Map's sites in `open-flow-nextpnr-s6.js` (the pads, global buffers, block RAMs and DSPs fixed for
  nextpnr, `spec.hardByNextpnr`, `S6_HARD_BY_NEXTPNR`), `s6MapOf` and the physical design's `conns` (the placer's timing
  estimate's). Silinx's Spartan-6 packer (`pack.js`, `phys.js`) stays: it gives the sites nextpnr packs into, checked site by
  site, and their settings, which the XDL writer writes; so do the device graphs, the bitstream, the timing analysis (its
  estimate of a connection not routed now its own), the XDL reader and writer. Process Properties loses its Map (Spartan-6)
  field (its Portuguese entry removed) and drops a saved `impl.s6Map` on OK; the MCP tool `set_process_properties` loses
  `s6_map` (refused as unknown) and drops it too; the ISE tests lose `SILINX_S6_MAP`. Tests: removed with the placer
  `s6-place`, `s6-pad-paths`, the two Maps' comparison (`examples-nextpnr-s6-pack*`, `s6-nextpnr-parity`; the examples'
  open flow on the Nexys3 and the Atlys stays in `examples`) and the placers' common parts' case of `engine-shared-parts`;
  `s6-xdl`, `s6-xdl-mem`, `s6-routing`, `s6-timing` and `s6-timing-flow` take their designs packed and placed by nextpnr
  (`test/s6-lib.mjs` `s6PlaceNextpnr`); nextpnr-s6 (a block RAM and a DSP48A1 packed and placed by nextpnr, no site
  fixed), mcp-s6-map (`s6_map` refused, a saved Map dropped, a project saved with Silinx's Map implemented by nextpnr's),
  family-profile (no Map's choice), the UI test open-toolchain (no Map field, in Portuguese neither; the saved choice
  built by nextpnr and dropped on OK). The research scripts `compare-place.mjs` and `place-xdl.mjs` go; `flow-xdl6.mjs`
  places with nextpnr. docs/TOOLCHAIN.md, docs/TOOLCHAIN-SEPARATION.md and the README follow.

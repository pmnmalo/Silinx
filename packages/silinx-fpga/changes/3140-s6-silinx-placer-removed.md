In detail:

- **The Spartan-6's placer removed (Fixes #3140):** `fpga/s6/place.js`, `place-moves.js`, `place-check.js`,
  `place-timing.js`, `pad-paths.js` and `fpga/place-common.js` go; the Spartan-6's back end packs and places with nextpnr
  alone (`fpga/s6/nextpnr-pack.js`): the spec's `s6Map` and `hardByNextpnr`, `S6_HARD_BY_NEXTPNR` and the API's `s6MapOf`
  are gone, and the log says "Packed and placed … sites by nextpnr" on every design. `physS6` no longer gives `conns`.
  Silinx's packer (`pack.js`, `phys.js`), whose sites nextpnr packs into and whose settings the XDL writer writes, stays.

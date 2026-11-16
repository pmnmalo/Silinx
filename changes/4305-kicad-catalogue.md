In short:

- **A KiCad catalogue in the Parts panel:** KiCad's 74xx and 4xxx parts and SparkFun's breadboard parts, found by their
  part number. A click imports just that part into the project as a KiCad file, its 74HC00 simulated as the 7400. No
  KiCad file is hosted in Silinx.

In detail:

- **The KiCad catalogue (#4305, #4278):** `core/kicad-catalogue-data.js` (written by `scripts/kicad-catalogue.mjs`) says
  where each of 212 parts is: its library file's URL and SHA-256 at a pinned version (KiCad 9.0.0's 74xx and 4xxx,
  SparkFun's v10.0.0), what it is in Silinx (as which IC, or drawn only) and its footprint's file. It holds none of a
  library's content. The Parts panel's *KiCad catalogue* group (folded, opened by a search) imports a part with a click
  (`core/kicad-catalogue.js`): its symbol and those it extends, each a file of its own in
  `parts/<library>.kicad_symdir/`, its footprint beside it, its origin written in it. Every file is checked against its
  SHA-256, and a file there with the same text is kept. Its files come through the local server (the catalogue's only,
  kept for offline use) or, in the browser's edition, from SparkFun's CORS host. Portuguese too.
- **MCP (#4305):** `part_libraries` with `catalogue` (searched by `query`); `import_part` with `part`.
- **`SILINX_KICAD_OFFLINE` (#4305):** the local server fetches none of KiCad's libraries and uses only what it kept.

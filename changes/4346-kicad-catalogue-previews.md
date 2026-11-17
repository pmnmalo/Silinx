In short:

- **The KiCad catalogue's previews:** each part is shown as it looks before it is imported: an LED round and in its
  colour, a resistor, a relay, a header, a DIP.

In detail:

- **The KiCad catalogue's previews drawn as the parts (#4346):** `scripts/kicad-catalogue.mjs` keeps each SparkFun
  footprint's drawing (as #4315 draws it, in grid steps, rounded, about 42 kB) and its pads' places in
  `core/kicad-catalogue-data.js` (`CATALOGUE_LOOKS`). `catalogueDrawing` (`core/kicad-catalogue.js`) makes a part of it
  for the preview, a DIP's for a part drawn only on a DIP, and `drawnPartSvg` (`web/js/circuit-draw.js`) draws it. The
  drawings are SparkFun's (CC-BY-4.0): THIRD-PARTY-NOTICES.md has their entry and licence.

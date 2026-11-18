In short:

- **IEC symbols in the panels:** with Settings ▸ Schematic Symbols set to IEC 60617-12, the Schematic editor's Symbols and
  the circuit editor's Parts show each gate's qualifier in its thumbnail (&, ≥1, =1, 1), so AND, OR and XOR no longer
  look the same; the MSI ICs their general qualifier (CTR, X/Y, Σ…) where it fits.
- **The symbols' and parts' tips:** resting the mouse on a symbol or a part shows a card with its drawing larger, its
  name, what it does ("NOR: OR with an inverted output…") and how it is drawn in the standard chosen ("IEC 60617-12: a
  box with ≥1, a bubble on its output").

In detail:

- **The panels' IEC thumbnails (#4524):** `symbolPreview` (`web/js/sch-palette.js`) drew a symbol's body only, and an IEC
  gate's qualifier is one of its texts: it now draws the qualifier of a gate, an inverter or a buffer in each box, sized
  to it (`fitQualifier` of `core/symbol-standard.js`), and an MSI IC's general qualifier given by the Parts panel, left
  out where it would not fit (a tall block's, the MUX8's). The Parts panel's AND-OR-INVERT ICs' boxes and latches have
  theirs too.
- **The tips' cards (#4524):** `web/js/symbol-tip.js`: a card beside a row of either panel (the mouse resting on it, or
  the keyboard's focus), its drawing 135 × 85, its name, its function and its look in the standard (`gateFunction`,
  `symbolLook` of `core/symbol-standard.js`), then the row's own tip, which the browser does not show meanwhile; gone at
  a click until the mouse moves. In Portuguese.

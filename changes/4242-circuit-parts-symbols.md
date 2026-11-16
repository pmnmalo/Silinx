In short:

- The circuit editor's Parts panel draws its gate ICs in the standard of Settings ▸ Schematic Symbols, and again when
  it changes.

In detail:

- **The Parts panel's gate ICs in Settings ▸ Schematic Symbols' standard (#4242):** their images were kept by part type
  alone, so each stayed in the standard it was first drawn in for the page's life (`web/js/circuit-parts-panel.js`);
  they are kept for each standard now, and the panel, drawn again on the setting's change (#4220), shows IEEE shapes or
  IEC boxes as the schematic editor's palette and Show inside do. Test: UI `circuit-parts-symbols` (new: a 7400 and a
  7432 in both standards, changed with the circuit open; no warnings), in both interfaces.

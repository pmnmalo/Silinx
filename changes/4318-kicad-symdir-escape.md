In short:

- **The KiCad catalogue's SparkFun 10k_Axial_1/6W resistor:** imported and found as a part. Before, its name's `/` made
  a subfolder and the circuit said there was no such part.

In detail:

- **A symbol's file in a .kicad_symdir named as KiCad 10 names it (#4318):** a symbol taken out of its library into a
  file of its own (the KiCad catalogue's import) gets its name escaped as KiCad's `EscapeString` does for file names
  (`/` as `{slash}`, `\`, `"`, `<`, `>`, `|`, `:`, tabs and line ends too: `symbolFileName` in `core/kicad-edit.js`).
  A PCM package's `.kicad_symdir` files named that way are read too.

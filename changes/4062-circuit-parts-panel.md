In short:

- The circuit editor's parts are in a panel of their own on the left, as the schematic's Symbols, each with its drawing
  (an IC's the schematic's symbol of its gate or block) and a search; the Properties on the right.

In detail:

- **The circuit editor's Parts panel (#4062):** on the left of the canvas (`web/js/circuit-parts-panel.js`): a search,
  the parts by category (folded and opened by their titles, their counts), each part a row with its drawing (an IC's
  the schematic editor's symbol of its gate, `nand2`, `inv`…, or of its block, `decoder`, `counter`…), foldable to a
  strip (remembered) and, on a narrow screen, over the canvas behind the toolbar's ☰ Parts. The Properties on the right
  keep the selection's and the circuit's. UI tests `circuit-parts-panel` (new), `circuit`, `circuit-parts`, in both
  interfaces and Portuguese.

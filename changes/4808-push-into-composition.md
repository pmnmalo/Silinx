In short:

- Push into an adder or a subtractor of a schematic: how it is built, level by level down to the gates (ADD8 of two
  ADD4, ADD4 of four FA1, FA1 of gates), in a read-only tab with ⬆ Up and ⬇ Push into. During a Try it, it shows the
  symbol's values there and follows them; Symbol Info lists its levels and opens it.

In detail:

- **A palette symbol's composition opened (#4808, part of #4806):** `web/js/sch-composition.js`, from the Properties'
  Push into, the right-click menu, Symbol Info's Composition section (its levels and Open the composition) and a
  double-click during a Try it (two presses timed: the first one draws the sheet again). A read-only tab, "ADD8
  (composition)", its notice at the end of the toolbar ("Read-only, how ADD8 is built: ADD8 › U1 (ADD4)"), ⬆ Up
  (Backspace) and ⬇ Push into (Enter, a double-click), as the RTL Schematic's (#2667); its own Try it simulates the
  level shown. Opened from a Try it, its values are the symbol's there: the levels above the one shown simulated with
  them (`core/symlib-live.js`), followed as they change; that Try it ended, it keeps its own. The schematic editor's
  `tryWith(inputs)` starts a Try it with given inputs.
- **MCP:** `symbol_composition` takes a level by its path of instances (["U1", "U2"]) and the symbol's inputs, and
  gives the level's values, as the tab shows them.
- The derived signals in the waves and the RTL Schematic's links to the compositions follow (#4857).

In short:

- In the Design pane, an adder, a multiplexer, a comparator, a counter… of a schematic is shown as its composition
  (u1 - ADD8, then its ADD4s, then their FA1s), each row opening it at its level, not as the HDL generated for it.

In detail:

- **The Design pane's rows of a palette symbol built of others (#4984, #4806):** `web/js/design-comp.js`.
  - The block entity generated for the symbol (`top_add`) is recognized by its mark (`blockMarkOf`).
  - It is listed as the symbol (`u1 - ADD8`), its composition's levels' instances under it, each row with a
    Composition badge.
  - Opening a row (Enter, a double-click, its badge) opens the composition at that level (`openComposition`'s new
    `at`: the instances pushed into).
  - Symbols with no composition (the flip-flops) stay as they were.
  - A composition is named as its symbol draws itself (D2_4E, M4_1, PENC8_3; ADD8, COMP8), in its rows, its tab and
    the MCP's `symbol_composition` (no more DECODER, ENCODER).

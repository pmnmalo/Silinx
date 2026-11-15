In short:

- **Boolean Algebra: the gates by type:** the results name their gates as the schematic draws them (`1 AND2B1, 2 AND3,
  1 OR3`), an inverted input of an AND, OR, NAND or NOR no NOT gate; Least number of gates and Least delay show their
  function, then its terms, literals and gates.

In detail:

- **The gates of a result by type (#4091, `core/logic-sch.js` circuitGates):** every result of the truth table says its
  terms, its literals and its gates by the library's names, as its schematic draws them: a complemented input of an AND,
  OR, NAND or NOR one of its inverted inputs (AND2B1, OR3B2…, #3786), an inverter (INV) only where one is drawn (an XOR's
  complemented input, a complemented output), a gate wider than the library's the gates it is split into (AND5, AND2…).
  - The circuit's gates and delay count the same gates: an inverted input adds no gate and no level. The forms of the
    least gates and of the least delay are chosen on them: an output in one of them may be in another form than before,
    its HDL module regenerated with the same function.
  - Least number of gates and Least delay show the function itself beside their name, not the name of the form it is
    in, and under it its terms, literals and gates.
  - MCP: `related_view`'s results say the same (each form's terms, literals and gates; the data's `cost` and `gates`).

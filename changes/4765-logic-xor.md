In detail:

- **core/logic.js split under the 1000-line limit (#4765):** its XOR / XNOR forms (`minimizeXor`, `exprCost`,
  `MAX_XOR_INPUTS`) moved as they were to core/logic-xor.js, still exported by core/logic.js (1000 -> 817 lines); the
  same results as before on the repository's truth tables and random columns.

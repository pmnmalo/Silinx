In short:

- **A state diagram's codes of the user's:** codes of different widths are valid (S0 `0`, S1 `10`, S2 `1001`), as long as
  each state's is different; each is shown as typed.

In detail:

- **Codes of any width (#5026):** under the encoding User-defined, Check no longer requires the states' codes to have
  one width: the state register is as wide as the widest code, the shorter ones zero-extended on the left, and two codes
  are the same once extended (`011` and `0011`: "States A (011) and B (0011) have the same code once zero-extended to 4
  bits: 0011"). The codes are shown as typed in the transition and state tables, the drawing and the MCP's
  `set_fsm_encoding` (`fsmEncoding`'s `shown`); the extended ones (`bits`) in the generated HDL, the encoded transition
  table and the gate-level schematic.

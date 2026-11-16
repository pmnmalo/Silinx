In short:

- **VHDL simulation: pull-ups and pull-downs:** a `std_logic` signal with several drivers resolves its weak values as
  IEEE 1164 does: a pull-up `'H'` beside an open collector reads `'H'`, then `'0'` when the collector pulls down
  (before: `'1'`, then `'X'`).

In detail:

- **std_logic's resolution of the weak values 'W', 'L', 'H' (#3926):** a value keeps the mask of its weak bits (a
  literal, a copy, a slice); the simulator resolves the drivers per bit as IEEE 1164's resolution table (a strong
  value wins over a weak one; a W, or an L and an H, make W); `'image` and `to_string` show L, H and W; `to_x01`,
  `to_01`, `to_bit` and `to_bitvector` make them strong, and the operators give strong values. `'U'` and `'-'` are
  still simulated as `'X'`. Tested against the standard's whole 9×9 table.

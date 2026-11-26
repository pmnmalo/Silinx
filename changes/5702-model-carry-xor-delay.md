In detail:

- **The post-place & route model's carry XOR with a constant CIN (#5702):** the model folds a slice's XORF whose CIN is
  the constant CYINIT (the first stage of a carry chain) but keeps its delay from the LUT to X, Topx, on a buffer: its
  SDF had lost 0.36 ns on such a path, the static timing's (lock's model with Yosys 0.71: 11.742 ns by the SDF, 12.101
  by the timing).

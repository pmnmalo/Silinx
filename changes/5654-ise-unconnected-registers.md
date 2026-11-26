In detail:

- **Stopwatch and lock build in ISE with no warnings again (#5654):** XST's `Xst:2677` (a register's node
  unconnected) is gone. Stopwatch's `to_decimal` gives each of its three multipliers its own register of the value,
  and the value's last 4 bits a register of their own: XST moves each register into its multiplier's input register
  whole, where the one register the three shared, also read for its last 4 bits, left its other bits behind on the
  Spartan-3E's and Spartan-3A's multipliers (#4877's three cycles, and its speed on the 7-series, kept). Lock's
  `typed.cpp` keeps the last three digits typed (12 bits) instead of four: the oldest digit's bits, shifted out at the
  next call, fed nothing.
- **The examples' tables measured again (#5654):** the open synthesis maps stopwatch and lock a little differently (the
  same flip-flops): their slices (slice-estimate, s6-pack), LUTs (synth-goal), word-level registers (compiled-words), the
  Gowin reference's routed designs (Apicula 0.32's .fs, byte for byte Silinx's) and vivado-paths' line.

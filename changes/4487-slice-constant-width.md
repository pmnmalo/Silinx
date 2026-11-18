In detail:

- **VHDL: a slice with a variable's bounds but a constant width keeps it (#4487):** since #4358 such a slice probed
  outside its prefix (an integer variable at integer'low) took its prefix's width even when its own did not depend on
  the variable: the RAMB16 models' `par(a * 1 + 0 downto a * 1)` was 2048 bits, and Check Syntax of a block memory
  warned of width mismatches in unisim.vhd. Its width is now probed with the variables at a few values: the same each
  time, it is the slice's (`a * 8 + 7 downto a * 8`, `w + 3 downto w`); one that depends on them (`w - 1 downto 0`)
  keeps its run-time width.

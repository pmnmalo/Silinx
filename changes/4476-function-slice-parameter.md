In detail:

- **VHDL: a function's slice with a parameter's bounds (#4476):** since #4358 a slice whose bounds read a variable took
  its prefix's width, in a function too, where its width is the result's: the stopwatch example's `quotient`
  (`return p(shift + 3 downto shift);`) returned 28 bits and warned three times "width mismatch: target is 4 bits,
  value is 28 bits". In a function the slice is probed as before, so its constant arguments bind it again with their
  values; a process's or a procedure's keeps #4358's run-time width.

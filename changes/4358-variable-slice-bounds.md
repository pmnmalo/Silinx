In short:

- **VHDL: a slice with a variable's bounds** (`l(w - 1 downto 0) := d(w - 1 downto 0)`) simulates; it was refused
  as 2147483648 bits wide, or wrote nothing.

In detail:

- **VHDL: slices whose bounds come from a variable (#4358):** the width of a slice of run-time bounds was the one
  probed at elaboration, with the variables at their initial values: a variable with no initial value
  (integer'low) gave a slice of 2147483648 bits (an error) or a null one (nothing written to a signal). Such a slice
  of a variable other than a loop's, probed outside its prefix, now has its prefix's width as its type and its
  run-time width as its value (an assignment writes the target's bits), and its `'length` is computed at run time.

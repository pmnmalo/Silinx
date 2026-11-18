In detail:

- **VHDL: a slice with a variable's bounds but a constant width keeps it (#4487):** a slice whose bounds read a
  variable (not a loop's) and that is probed outside its prefix has its width probed with those variables at a few
  values (src/elab-expr.js `fixedWidth`): the same each time (`par(a * 1 + 0 downto a * 1)`, the RAMB16 models'), it
  is the slice's; one that depends on them (`w - 1 downto 0`) keeps the run-time width of #4358, typed as its prefix.

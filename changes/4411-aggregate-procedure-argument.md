In short:

- **VHDL simulation: an aggregate passed to a procedure** (`p((3, 4))`) no longer stops the simulation with an
  internal error when the procedure indexes its parameter.

In detail:

- **VHDL: a procedure's aggregate actual takes its parameter's type (#4411):** an aggregate passed to a procedure's
  constrained array parameter was bound with no type (a function's already took its parameter's), so indexing the
  parameter inside the procedure stopped the behavioural simulation ("Cannot read properties of undefined"); both
  now share one helper, `aggregateParamType`.

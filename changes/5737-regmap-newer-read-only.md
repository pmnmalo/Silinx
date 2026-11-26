In short:

- A register map saved by a newer Silinx opens read-only, as the other drawings do, instead of being refused.

In detail:

- **A newer register map opened read-only (#5737):** a register map (`.regs.json`) whose version is above this Silinx's
  was refused (`cannot open …: a register map of version 99: this Silinx reads version 1`). `readRegmap` (core/regmap.js)
  now reads it as it is, its version kept, so its editor opens it read-only with the notice "Read-only, saved by a newer
  Silinx" and the console's warning (#4756), and the server still refuses to write it back in the older format. The
  same read serves a System's simulation (`regmapFor`, which skipped such a map) and the MCP's `related_view` header.
  Tests: regmap; the UI test newer-drawing, both interfaces, in Portuguese.

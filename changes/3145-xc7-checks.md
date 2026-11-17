In detail:

- **The 7-series' builds checked without byte-identity (#3145):** `npm run check:xc7` (`scripts/check-xc7.mjs`) builds the
  examples (or project folders) through the open flow and checks each `.bit` with no Vivado: its frames the ones
  Project X-Ray's fasm2frames makes of nextpnr's FASM, the round trip by bits clean, and its pins: each port's IOB at its
  XDC pin, with its direction and IO standard, and no other IOB configured. `--vivado` then runs
  `scripts/xc7-vivado-compare.mjs`, which now also reads Silinx's own `.bit` with Vivado's `write_cfgmem` (its format
  checked; a column of the comparison's table in docs/TOOLCHAIN.md). The open-flow test of every example on the Basys 3
  and the Nexys A7 checks the pins too.

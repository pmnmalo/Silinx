In short:

- **The 7-series' timing fitted to Vivado's:** on the Basys 3 and the Nexys A7, nextpnr's estimate now uses delays measured
  by Vivado. It was 1.1 to 2 times Vivado's Fmax; now it is a little below it. The Design Summary's timing caption says so.

In detail:

- **The 7-series' timing fitted to Vivado's (#3516):** `@silinx/nextpnr-himbaechel-xc7`'s chip database is built with the
  cells' and wire classes' delays of `research/xc7/timing-fit.json`, and a DSP48E1 with no register is timed. The
  timing's model (`XC7_TIMING_MODEL`), the Design Summary's caption, the README and docs/TOOLCHAIN.md say "its delays fitted to Vivado's"
  instead of "optimistic against Vivado"; in Portuguese too.

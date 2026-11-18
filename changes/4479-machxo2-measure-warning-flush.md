In detail:

- **The MachXO2's measurement keeps a Yosys warning whole (#4479):** `scripts/machxo2-measure.mjs` took YoWASP's flush for
  the end of a line, and Yosys flushes between `Warning: ` and the warning's text: a warning of `synth_lattice` was
  recorded empty and its text dropped. The flush is now ignored, and a test checks a design that warns (two drivers of
  a register's bit).

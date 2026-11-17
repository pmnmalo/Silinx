In detail:

- **VHDL simulation: a bit-string literal's weak values (#4370):** a bit-string literal with L, H or W (`b"LHW1"`,
  `x"L1"`) keeps them as a string literal does since #3926 (before: `01X1`, `00000001`); the #396 test expects the
  weak values `to_string` shows since #3926 (`LH0XWX1X`, before `010XXX1X`), which failed the nightly run.

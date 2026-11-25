In detail:

- **A top module named `\$…` or `\1…` found in Yosys 0.71's JSON (#5605):** Yosys 0.71 writes such a public name
  without its backslash (`"$__SHREG_DFF_P_"`, `"1dff"`; 0.70: `"\\$__SHREG_DFF_P_"`); readYosysJson finds the
  top module with or without it.

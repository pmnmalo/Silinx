In detail:

- **The breadboard example in the comparison with Vivado (#4035):** recorded on the Basys 3 and the Nexys A7
  (`test/xc7-vivado-comparison.json`, docs/TOOLCHAIN.md's table). Vivado builds it with no warning and its DRC clean, and
  takes Silinx's netlist with no error (3 LUTs, 267 MHz); Silinx's open flow 4 LUTs, 241 and 250 MHz, Vivado's own 4 LUTs,
  450 and 446 MHz. `scripts/xc7-vivado-compare.mjs --update` writes the results with the file's 2-space indentation.

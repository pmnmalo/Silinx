In detail:

- **The Gowin netlists' test fails on an assert … severity error (#4363):** `test/gowin-netlist.test.js` marks a test bench's
  error entries `ERROR: ` as the iCE40's and ECP5's harnesses do, so a netlist whose test bench fails an assertion (blinky's
  "knight rider did not reach the MSB", whose text says no ERROR) and then prints "Simulation finished OK" no longer passes; a
  test of the harness itself, in VHDL and in Verilog. The 11 examples' Gowin netlists still pass.

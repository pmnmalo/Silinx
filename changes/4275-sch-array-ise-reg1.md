In detail:

- **The ISE export's UI test of an arrayed instance after #3870 (#4275):** `test/ui/sch-array-ise.test.js` expects the
  instance `reg(3:0)` written to ISE's schematic as `reg_1(3:0)` (reg, a reserved word ISE's sch2hdl refuses), the
  export's exact console lines (its warning on the renamed instance among them) and `reg_1(3:0)` imported back; it
  still expected `reg(3:0)`, failing every run since #3870.

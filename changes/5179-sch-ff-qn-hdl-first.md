In detail:

- **The flip-flop QN UI test tries the sheet out once the saved HDL is in the project (#5179):**
  test/ui/sch-ff-qn.test.js clicked Try it while src/qn.vhd, made again from the QN just saved, was still on its way:
  on a loaded runner it arrived after Try it started, and its compile of changed sources ended Try it (#4601), the
  simulation bar's Step gone. The test waits for the new HDL in the project's sources first.

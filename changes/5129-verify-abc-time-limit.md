In detail:

- **Verify's mutated examples' tests give the check a limit it never nears (#5129):** test/verify-abc.test.js's
  stopwatch and micro80 with a line mutated ran Verify with a 120 s limit; the time is Yosys's (the stopwatch's
  structural proof 20 s, its miter's AIG 12 s here), not ABC's, whose bmc3 finds the difference at once, so a bound in
  clock cycles would not shorten it: on a runner 3 times slower the limit was reached first, "no counterexample to
  replay". Their limit is 900 s.

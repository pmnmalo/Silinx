In detail:

- **The ISE interop test of an arrayed instance ticks its shared pins (#4568):** since #4451 an arrayed instance's pin
  on a net fixed at its own width (a 1-bit I/O marker) is shared by the copies with a warning unless ticked in Shared
  pins; the test of #3828 and #3870 (test/ise/xise-interop.test.js), whose `reg(3:0)` has its clock and enable on
  1-bit markers and asserted no warnings, now ticks them, as #4486 did for simulate_drawing's test (the HDL the same).

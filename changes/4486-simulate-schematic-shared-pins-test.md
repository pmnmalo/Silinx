In detail:

- **simulate_drawing's schematic test ticks its shared pins (#4486):** since #4451 an arrayed instance's pin on a net
  fixed at its own width (a 1-bit I/O marker) is shared by the copies with a warning unless ticked in Shared pins; the
  test of #3827 (test/mcp-simulate-schematic.test.js), whose `reg(3:0)` has its clock and enable on 1-bit markers and
  asserted no warnings, now ticks them (`place_instance`'s `shared`), and a test of its own asserts the two warnings
  of the unticked schematic and its simulation, the same.

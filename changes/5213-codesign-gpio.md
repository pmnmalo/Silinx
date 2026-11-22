In short:

- Co-design: GPIO links run: an Arduino's pin wired to an FPGA's port (a bus's bit too) in Try it and in the System
  Emulator, as the System editor draws them.

In detail:

- A GPIO link to an FPGA node's bus bit (`led<0>`, as the UCF writes it) is the scheduler's `led[0]`: it was not a pin
  of the node, and the System could not be run (core/system-build.js). A 1-bit port's board pin is found by either
  spelling, `btn` or `btn<0>`, as the Board Emulator reads it: it was said to have no pin, its levels not checked
  (core/system-check.js). The user's guide says how a GPIO link is drawn and checked (#5213).

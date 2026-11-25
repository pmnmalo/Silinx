In short:

- **Verilog `disable` of a block around a fork ends the fork:** the event-with-a-timeout idiom (a fork of a delay and an
  event, each disabling the named block around it) goes on as soon as the first branch disables the block.

In detail:

- **A fork branch's `disable` of an enclosing named block ends the fork's other branches (#5464):** as IEEE 1364-2005
  and Icarus; the fork waited for them, so the statement after the block ran only when they ended
  (`packages/silinx-hdl/src/simulator.js`, `interp.js`).

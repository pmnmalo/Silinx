In short:

- **Live sharing: Try it is followed:** while you follow someone's shared project, their Try it is on your page too, in
  every module that has one (a state diagram, an ASM chart, a Petri net, a schematic, a circuit): the panel open, the
  inputs, the steps they take, the state and the outputs. A click of yours in it is browsing alone, as in their
  simulations; Follow <owner> follows them again.

In detail:

- **Try it shared live (#4244):** a new activity channel, `try` (`core/collab-try.js`, `web/js/collab-try.js`): the
  owner's page sends each open document's Try it, its editor's `tryState()`, at its sharing's tick when it changed; a
  follower's page puts it on its own document with `setTryState()`, opened and closed with the owner's. A state
  diagram's, an ASM chart's and a Petri net's Try it travels as its state (the present state, the registers, the
  marking, the inputs, the cycle, the trace); a schematic's (a Boolean algebra's, a circuit's and an RTL schematic's
  too) and a circuit's as their inputs then and the steps taken since it started, which the follower's own simulation
  replays (only what is new; a clock's cycles and its run sent as one growing step, within the relay's limits, #4173).
  What a follower takes is untrusted input: checked, capped, what is not one left out. A followed schematic can be
  tried read only. The follower's own click, key or input in a Try it is browsing alone. MCP: `follow_project`'s
  `ownerActivity.try` and its lines give each document's Try it: its state, steps, inputs and outputs. Tests: unit
  (`test/collab-try.test.js`: the values made and taken, a schematic's and a circuit's steps replayed to the owner's
  values), `follow_project`'s, and UI tests with the owner's and a viewer's pages for a state diagram and a schematic,
  in both interfaces, in Portuguese, no warnings.

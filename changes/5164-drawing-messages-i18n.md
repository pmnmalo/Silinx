In short:

- **The Petri net, circuit and state diagram editors' messages in Portuguese:** an arc that cannot be, a value
  refused, a wire drawn straight, Try it's short circuit: said in the console in the interface's language.

In detail:

- **The drawing editors' messages translated (#5164):** the Petri net's, the circuit's and the state diagram's
  `onMessage` (`web/js/drawings.js`) log their text through `t()`, as the ASM chart's, the truth table's and the
  schematic's did (the state diagram's "(not applied)" too); the Portuguese of the circuit's messages that had none
  (Try it's short circuit, oscillation and "cannot be simulated", a wire drawn straight, a clock's frequency, a wire
  that joins one place) and of a PNML file refused.

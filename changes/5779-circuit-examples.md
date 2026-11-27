In short:

- New Project ▸ Circuit offers more examples: Circuit versions of the crossing, the knight rider, the stopwatch and the
  combination lock, made only of drawings (schematics of the palette's symbols, state diagrams, truth tables, an ASM
  chart, a Petri net, a breadboard), each with a test bench that checks it.

In detail:

- **The Circuit versions of the examples (#5779, roadmap #5753):** `examples/traffic-circuit` (the crossing's state
  diagram and lamps' truth table under a schematic whose timer is the palette's counter, AND and OR gates),
  `examples/blinky-circuit` (a knight rider: a counter, three XOR gates, a 3-to-8 decoder), `examples/stopwatch-circuit`
  (two decade counters, each a counter cleared after 9 by a comparator, a T flip-flop's start and stop) and
  `examples/lock-circuit` (the lock's state diagram, truth table, ASM timer, Petri-net alarm and 74LS175 breadboard, its
  penalty a constant): Circuit projects, no board nor constraints, each with its self-checking test bench.
  `core/examples.js` `CIRCUIT_ORDER`: listed after the FPGA examples, offered by New Project's Circuit card only; an FPGA
  or System project cannot start from one; the MCP's `new_project_from_example` makes one a Circuit project by default,
  `list_examples` says it a Circuit example.
- The user's guide's Project modes page lists them.

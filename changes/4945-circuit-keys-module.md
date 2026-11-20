In detail:

- **The circuit editor's keys in a module of their own (#4945):** its keydown handler moved, as it was, from
  mountCircuitEditor (at 300 lines) into web/js/circuit-keys.js, with a test of its own; no change of behaviour.

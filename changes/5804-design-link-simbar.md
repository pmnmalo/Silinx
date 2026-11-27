In detail:

- **design-link's Try it test and the ngspice button (#5804):** it lists Try it's bar's shown buttons
  (`.circ-simbar > :not([hidden])`, as test/ui/circuit.test.js does), not every button of a shown bar: the ngspice
  button (#5386), hidden for a digital circuit, is no longer counted.

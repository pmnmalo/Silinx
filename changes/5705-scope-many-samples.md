In detail:

- **An oscilloscope's measurements on a screen of very many samples (#5705):** core/scope.js's measure finds the
  minimum and the maximum in a loop, not by spreading every sample into Math.min and Math.max, which overflowed the
  stack on a long analog Try it and stopped the editor drawing. Regression test in test/scope.test.js.

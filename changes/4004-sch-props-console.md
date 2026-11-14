In detail:

- **The schematic editor's tests in node again (#4004):** the Properties' Width field loads the console's module when
  it reports an error, not when the editor loads (it loaded the application's main module, which a test in node has
  not: `test/web-sch-move.test.js` failed).

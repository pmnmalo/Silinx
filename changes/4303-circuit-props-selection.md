In short:

- **Circuit editor's Properties:** with a part or a wire selected, only its properties are shown; the circuit's own
  section (its name) shows when nothing is selected.

In detail:

- **The Circuit section hidden while a part or a wire is selected (#4303):** the circuit editor's Properties showed
  the circuit's section under the selection's. It now shows only the selection's, and the circuit's again once
  nothing is selected (`web/js/circuit-side.js`).

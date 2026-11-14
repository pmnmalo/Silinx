In detail:

- **A flaky UI test waits for what it reads (#3953):** test/ui/new-source-no-add-box.test.js waits for the new
  drawing's HDL file in the project before it reads silinx.json, written after the drawing appears.

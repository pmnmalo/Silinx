In detail:

- **Usability tests: the HDL editor and the simulation (#5206, its first phase):** `test/usability/hdl-edit.test.js`: a
  4-bit counter typed from an empty file in VHDL and in Verilog, character by character (the brackets and quotes the
  editor closes, completions taken from its list, the indentation it gives corrected with Backspace and Tab), the text
  after every line the typing's model's (`lib/hdl-typing.js`); a `;` left out on purpose, Check Syntax's lines exactly,
  its error's row clicked to its line, fixed, Check Syntax clean; Undo to the empty file and Redo to the end; the file
  saved as typed. `hdl-sim.test.js`: the Test Bench Wizard on that counter (random vectors, the expected values from the
  design), the bench passing; its waves zoomed, the cursor clicked, a marker, a signal of the counter added, a radix, the
  wave configuration saved, the simulation run again and the configuration loaded, the values at the cursor after every
  step the reference simulator's on the same files (`lib/wave-kit.js`). In both interfaces and in Portuguese; the bugs
  they found are todos: #5218, #5219, #5220, #5221, #5222, #5223.

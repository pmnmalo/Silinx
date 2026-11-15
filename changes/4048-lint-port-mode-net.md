In short:

- Check Syntax no longer says an input is updated or an output read when a component's output is wired to one of its
  own inputs (a chip's gate feeding its next gate).

In detail:

- **No false "mode IN can not be updated" / "mode OUT can not be read" (#4048):** with an instance's output and one of its
  inputs on one net, the elaborator makes them one signal, and the design checks took a write of the output for an
  update of the input, and a read of the input for a read of the output. The rules now look at the port the statement
  names (`core/lint.js`); a port written or read by its own name is still an error (VHDL's case-insensitive names too).
  The breadboard example's simulation model has no design-check message now.

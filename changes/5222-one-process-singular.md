In short:

- Check Syntax says "1 process" and "1 signal" for one, not "1 processes".

In detail:

- **One signal, one process in the singular (#5222):** the elaboration's counts (`Elaborating module <…>`, the
  Simulation's `Elaborating top module <…>`, `Simulation model ready`, the MCP's `check_syntax` result and the command
  line's `silinx check`) come from one function, `designSize` (`core/hdl-check.js`), that says one in the singular.

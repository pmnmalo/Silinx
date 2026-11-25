In short:

- **A wait on a Verilog reg's change at 0 ns no longer stops the simulation:** a VHDL process waiting on its port
  driven by a Verilog `reg`, or a Verilog `always` block waiting on `@(…)`, woken at 0 ns by a blocking assignment, was
  said to loop forever without waiting.

In detail:

- **A wait on an event ended in the same delta counts as a wait (#5465):** a process with no sensitivity list (a VHDL
  process with `wait on`, a Verilog `always` with an event control, a fork's branch in it) woken by a Verilog blocking
  assignment in the delta it started its run was taken for a loop without a wait; a VHDL port is the Verilog reg it is
  connected to, so `wait on m;` of an entity instantiated in Verilog stopped at 0 ns
  (`packages/silinx-hdl/src/simulator.js`).

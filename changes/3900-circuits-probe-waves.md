In short:

- **Digital circuits, a logic probe and the waveforms:** a logic probe shows its net's level while trying a circuit
  (H, L, open, X); *Waveforms* opens the Try it in SSim, the waveform viewer of every simulation, its probes' nets first.

In detail:

- **The logic probe and the waveforms of the digital circuits (#3900, part of #3897):** a logic probe part (no port of
  the HDL; the net it watches a signal of it); the Try it session's inputs' changes kept at their simulated times, a
  clock's ticks moving the time on by its half period (`advance`); `core/circuit-replay.js` writes them as a test bench
  of the circuit's generated HDL, `web/js/circuit-waves.js` runs it and opens it in SSim (as the logic analyzer's
  capture), the MCP's `simulate_drawing` returns its probes' waves (`waveforms`) and each step's probes. Tested: the
  replay's waves the engine's own, time for time, in VHDL and Verilog (an inverter, a counter on a clock source).

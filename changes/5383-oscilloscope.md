In short:

- **An oscilloscope in the circuits:** two channels on any nets, its time base and scale, its trigger (rising or
  falling, its level; auto, normal, single), its cursors and its measurements (frequency, period, duty cycle, Vpp, mean),
  drawn on the circuit while trying it.

In detail:

- **An oscilloscope (part of #5383, #5387):** core/scope.js, its traces, their crossings, its trigger and its
  measurements (the period between rising crossings of the middle, the duty cycle, Vpp, the mean as an integral, the
  rise and fall times 10 % to 90 %); core/circuit-scope.js, the part (CH1, CH2), its settings (tdiv, vdiv, source,
  level, edge, mode: normalized, edit_circuit's set) and its recorder, fed by the simulation's new onUpdate after each
  update of the levels; drawn on the canvas (web/js/circuit-draw-scope.js) with its knobs, its trigger's marks, its
  cursors and its readouts; Try it in real time with a scope (a tenth of a second of simulated time a tick at most);
  its Properties; Portuguese. simulate_drawing says each scope's measurements each step. Tests: scope (a square wave's
  period, duty, Vpp and mean; an RC's 10–90 % rise and fall against τ ln 9; a sine; a 74LS14 RC oscillator's frequency
  and duty cycle against its exponentials; the trigger's modes; the settings), mcp-circuit; the UI's circuit-scope in
  both interfaces and Portuguese, the Parts panel's counts.

In short:

- **Analog parts in the circuits:** resistors, capacitors, a potentiometer, a light-dependent resistor, a thermistor, a
  diode and a voltmeter, solved as a circuit with the logic: the inputs read their voltages against their thresholds (a
  Schmitt trigger's hysteresis), the LEDs light as bright as their current, a missing current-limiting resistor is said
  in the console.

In detail:

- **An analog solver for the circuits and the analog/digital boundary at the pins (#5382, part of #5387):**
  core/analog-mna.js, a modified-nodal-analysis solver (resistors, capacitors, ideal sources and sources with their
  output resistance, current sources, diodes by Shockley's equation and Newton's method), DC and in time (backward
  Euler then trapezoidal); core/circuit-analog-parts.js, the parts (resistor, capacitor, potentiometer, LDR, NTC
  thermistor, 1N4148, voltmeter), their values ("4k7", "100n") and the electrical side of the logic: the families'
  output levels and resistances, their input thresholds (the 7414's and 74132's Schmitt triggers), the 74LS input's
  current, the LEDs' diodes by colour; core/circuit-analog.js, the analog nodes of a circuit with an analog part,
  coupled to the event-driven simulation (its drivers sources, its levels read from the voltages, a floating node Z),
  stepped in time by its own wake-ups (smaller steps near a threshold). A circuit with no analog part as it was. An LED
  with more than 30 mA said once. The checks (a resistor propagates a net's drive) and the HDL (a resistor from a rail a
  pull, between nets a link). Drawn (web/js/circuit-draw-analog.js), the Parts panel's Analog group, their Properties,
  Try it in real time, the LEDs' brightness; Portuguese. MCP: edit_circuit's set (ohms, farads, pos, lux),
  simulate_drawing's voltmeters and LED currents, circuit_parts' values. Tests: analog-mna (hand-computed circuits, RC
  and RC-ladder closed forms, diodes by bisection), circuit-analog (an LED's current, dividers, the LDR's and NTC's
  curves, 74LS thresholds, a 7414 RC oscillator's period against its exponentials, an RC debounce, the HDL in VHDL and
  Verilog as the engine), mcp-circuit, the UI's circuit-analog in both interfaces and Portuguese.

In short:

- **Circuits:** an ultrasonic range sensor (HC-SR04) among the Inputs: a trigger on Trig, its echo on Echo as long as
  the object's distance says; the distance set while trying it (its − and +), in its Properties, by the MCP and in a
  System.

In detail:

- An ultrasonic range sensor, HC-SR04, as a circuit's part (#5456, part of #3902): core/circuit-sonar.js; a trigger of
  10 µs or more, then its echo 0.46 ms after the trigger falls, 58.3 µs a centimetre (38 ms out of 2..400 cm); a
  shorter trigger said once, one while it measures not seen; unpowered, its Echo open. The live simulation's devices
  wake up at their own times (core/circuit-sim.js wake, nextWake): its echo's start and end; Try it reaches them in
  real time and its simulated time follows the real one while the circuit has one, so that a trigger made by hand
  lasts what it lasted. What a part senses is its `sense` (the distance, `cm`: its range and step), normalized and
  edited in its range, its Properties' Distance (cm), setSensed / sensed while running. Its HDL
  (core/circuit-hdl-sonar.js, simulation only, as the servo's): its echo where the live one's is, in VHDL and in
  Verilog. Drawn as the part (web/js/circuit-draw-sonar.js, its colours CSS tokens): its board, its cans, its pins'
  names, its distance between a − and a + (5 cm a click), its sound while it measures. Its checks (not powered, Trig
  driven by nothing, joined to nothing), Part info, the Parts panel's Inputs, Portuguese; left out of the KiCad export.
  A System's circuit node wakes at the sensor's times (its echo timed by an Arduino's Timer1 to the count), takes its
  distance as a control (the System Emulator's − and +, the MCP's simulate `value`) and says its last echo. The MCP:
  simulate_drawing sets it by its id and a step's `after_us` lets time pass; circuit_parts lists it. The System MCP
  test's board state names the buzzers and the ultrasonic sensors (stale since #5454). Tests: circuit-sonar (its
  timings, in a circuit, its distance, its checks, its HDL in VHDL and in Verilog with no lint warnings and the live
  one's echo, an Arduino timing its echo through a System), mcp-circuit, mcp-system, web-i18n, circuit-coverage,
  kicad-library; the UI's circuit-sonar, both interfaces and Portuguese, and the Parts panel's counts (Fixes #5456)

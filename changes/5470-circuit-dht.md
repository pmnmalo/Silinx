In short:

- **Circuits:** temperature and humidity sensors (DHT11, DHT22) among the Inputs, with their one-wire protocol: an
  Arduino reads them; their temperature and humidity set while trying them.

In detail:

- The temperature and humidity sensors DHT11 and DHT22 as a circuit's parts (#5470, part of #3902): core/circuit-dht.js;
  their one-wire protocol (a start held low 18 ms or 1 ms and released; 30 µs later its answer: 80 µs low, 80 µs
  released, 40 bits of 50 µs low and 26 or 70 µs released, 50 µs low): the humidity, the temperature (a DHT22's tenths,
  its sign bit) and the checksum; a read sooner than its interval (1 s, 2 s, its power-on's too) or a start too short
  not answered, said once. Their answer is their own wake-ups. What a part senses may be several values (`sense`: the
  temperature and the humidity), each nudged by its − and + on its step (0.1 kept a tenth), its control in a System and
  in simulate_drawing <id>.<prop> (DHT1.temp); the HC-SR04's distance the same way. Their HDL (core/circuit-hdl-dht.js,
  simulation only): their answer the live one's, in VHDL and in Verilog, no lint warnings. Drawn as the parts
  (web/js/circuit-draw-dht.js, CSS tokens): the DHT11's blue case, the DHT22's white, their grille, what they sense
  between a − and a +. A contact may join GND to an open-drain line with its pull-up (a button to start a read by hand):
  the check no longer counts the open drain as a driven side, the HDL copies the GND side to it. Their checks, Part
  info, Properties (Temperature, Humidity), the Parts panel's Inputs, Portuguese; left out of the KiCad export. A
  System's circuit node, its emulator and the MCP's simulate say them and set them; edit_circuit's set takes `hum`;
  circuit_parts lists them. Tests: circuit-dht (the datasheet's frames decoded independently, the protocol's timings
  and refusals, in a circuit, their HDL in VHDL and Verilog the live one's, an Arduino reading a DHT22's 40 bits with
  Timer1 through a System), mcp-circuit, mcp-system, web-i18n, circuit-coverage, kicad-library; the UI's circuit-dht,
  both interfaces and Portuguese, and the Parts panel's counts (Fixes #5470)

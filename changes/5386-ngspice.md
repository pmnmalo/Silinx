In short:

- **ngspice:** an analog circuit's run can be simulated again by ngspice, a second opinion on its waveforms: the Try it
  bar's ngspice button (on the local server), or simulate_drawing's `ngspice`. One way: the digital outputs drive
  ngspice's circuit as Silinx simulated them. ngspice (eecircuit-engine, in WebAssembly) is downloaded on first use, not
  shipped; Silinx's own solver stays the default.

In detail:

- **ngspice through eecircuit-engine 1.9.0 (#5386):** core/circuit-spice.js writes a circuit's recorded run
  (core/circuit-analog.js's record) as a SPICE netlist: its resistors, capacitors (from their voltages when recorded,
  UIC), diodes and LEDs, function generators and potentiometers turned as piecewise linear sources, each digital output
  a source of its volts through its conductance in time; ngspice's result read back as each net's waveform, its
  voltmeters and scopes said. server/ngspice.js downloads the package's tarball on first use (its SHA-256 pinned, kept
  in ~/.silinx/ngspice/, checked again by each process) and runs it in a worker thread of its own; PINNED (an npm kind
  added to the monthly Pins check: its version, the tarball's SHA-256). The route /api/ngspice (a netlist of Silinx's
  own only), the Try it bar's ngspice (Portuguese), simulate_drawing's `ngspice`. NOTICE and THIRD-PARTY-NOTICES: its
  MIT wrapper, ngspice's Modified BSD with KLU (LGPL-2.0) and numparam (LGPL-2.0-or-later), OSDI (MPL-2.0), the
  bundled model cards (Apache-2.0, unused). docs/user/en/circuits.md. Tests: circuit-spice (the netlist against the
  run), ngspice-fetch (the download, a stand-in package), ngspice (an RC's step against its exponential, the 74LS14
  oscillator's capacitor against Silinx's solver within 1 mV), mcp-circuit, check-pins, third-party; the UI's
  circuit-ngspice in both interfaces and Portuguese.

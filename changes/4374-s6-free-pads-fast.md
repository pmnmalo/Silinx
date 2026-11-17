In detail:

- **Spartan-6: a design with ports without a LOC implemented in seconds again (#4374):** since nextpnr's packer became
  the Spartan-6's Map (#3140) the pads of the ports with no LOC were placed by nextpnr's simulated annealing, 30–50 s a
  seed for 62 of them (on Windows `test/s6-pad-paths.test.js` timed out); they take Silinx's pads again, as with Silinx's
  Map: a 64-bit shift register on the Nexys3 in 5 s instead of 105 s.

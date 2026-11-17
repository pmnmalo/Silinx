In detail:

- **The Spartan-6's Map by nextpnr: the ports without a LOC on Silinx's pads (#4374):** with nextpnr's packer (the
  default since #3140) the I/O buffers whose port has no LOC take the pads Silinx's placement gives them (with #3349's I/O
  paths), as with Silinx's Map: `packInput`'s `padLocs`. Left to nextpnr's simulated annealing, a design with 62 such
  ports took 30–50 s a seed to place (the rest of it 0.2 s); now 1 s.

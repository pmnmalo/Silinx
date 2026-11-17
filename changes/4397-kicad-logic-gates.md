In short:

- **30 more gate ICs:** buffers, open collector, Schmitt trigger and many-input gates of the 74 and 4000 series (7407,
  7409, 74132, 74133, the AND-OR-INVERTs 7451, 7454, 7455, 4023, 4049, 4077…), in the Parts panel and as KiCad's parts. KiCad's 74LS09, 74LS132, 4023 and
  others now work in Try it instead of being drawn only.

In detail:

- **KiCad's other gates as library ICs (#4397, group A):** `core/circuit-ics.js` adds 20 gates of the 74 series (7407,
  7409, 7412, 7413, 7415, 7421, 7422, 7426, 7428, 7433, 7437, 7438, 7440, 74132, 74133, 74136, 74386, and the AND-OR-INVERTs
  7451, 7454 as the 74LS54 and 7455) and 10 of the
  4000 series (4002, 4012, 4023, 4025, 4049, 4050, 4072, 4073, 4075, 4077). Each has its datasheet's pinout, and the
  gates now have the buffer, XNOR and AND-OR-INVERT functions and a DIP of 16 pins. They run in Try it, Check, the HDL and synthesis,
  and the MCP's circuit_parts and edit_circuit have them, as the other gates do. KiCad's open collector outputs that
  its symbols call outputs (its 74LS22's) fit an open collector IC. The catalogue's KiCad parts that behave as ICs go
  from 73 to 105 (KiCad's standard TTL 7454 differs from the 74LS54 and stays drawn only). Show inside names the pins of the 4023, 4025, 4073 and 4075 (one of their gates has an input past
  its output, and its lines would cross) and of the AND-OR-INVERTs.

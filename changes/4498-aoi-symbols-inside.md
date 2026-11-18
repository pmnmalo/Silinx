In short:

- **Circuit editor, the AND-OR-INVERT gates:** the 7451, 7454 and 7455 show their symbol in the Parts panel (AND gates
  into a NOR) and their gates with Show inside, as every other gate IC; the J-K and D flip-flops and the D registers
  added lately show their schematic symbols in the Parts panel too.

In detail:

- **The AND-OR-INVERT gates drawn (#4498):** the Parts panel's row of the 7451, 7454 (the 74LS54) and 7455 shows its
  terms' ANDs into a NOR, in IEEE's shapes or IEC's boxes as Settings ▸ Schematic Symbols says, instead of a bare DIP;
  Show inside lays them out as their datasheets' connection diagrams (`core/circuit-inside-aoi.js`): each term's AND
  turned toward the body's middle beside its pins, its lines into the NOR facing the output pin, horizontal and vertical,
  none crossing. The Parts panel's rows of #4397's group C (the 7473, 7478, 74107, 74109, 74113, 74114, 4027, 4013,
  the D registers) and group D's counters show their schematic symbols (fjkcp, fdcp, register, counter). A test over
  the whole library holds every IC to a tip and a symbol (the latches have none of the schematic's yet), and every
  combinational gate IC to its gates drawn inside (but the 4023, 4025, 4073, 4075); the MCP's `circuit_parts` gives
  each IC's title and logic as the editor's tip and Part info.

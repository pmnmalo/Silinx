In short:

- **Three-state buffers:** the 74125, 74126, 74240, 74241, 74244, 74365 to 74368, 74540 and 74541, in the Parts panel
  and as KiCad's parts (their LS, HC, HCT, AHC, AHCT and LVC symbols too). An output that is off is Z, and the net's
  other drivers or its pull set it.

In detail:

- **The three-state buffers (#4397, group B):** `core/circuit-ics.js` gives the gates enables. A gate drives its
  output while all its enable pins are at their active level, and its output is off (Z) once one is not (X while one is
  unknown). This works in the engine, in the ICs' HDL, and in the digital model synthesis reads: there, a buffer's
  level while enabled, else the net's other drivers' or its default, as the 74595's outputs. It adds 11 ICs with their
  datasheets' pinouts. KiCad's `_Split` symbols are read as their chip (74LS244_Split as the 74244). The catalogue's
  KiCad logic ICs that behave go from 105 to 132. The 74242, 74243 and 74245 transceivers, whose pins are inputs and
  outputs at once, come next.

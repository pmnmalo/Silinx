In detail:

- **KiCad's libraries read in core, the first step to KiCad parts in the circuit editor (#4279, #4278):**
  `core/sexpr.js` parses KiCad's S-expressions with limits on the file's size, the lists' depth and the number of
  tokens (a malformed file is an error with its line); `core/kicad-sym.js` reads a `.kicad_sym` library (KiCad 6 to
  10) or a `.kicad_symdir` folder into its symbols: their properties, units and De Morgan bodies, pins (number, name,
  electrical type, style) and graphics, a derived symbol (`extends`) resolved from its parent, in another file of the
  folder too; KiCad 5's `.lib` is refused with what to do. `core/kicad-mod.js` reads a `.kicad_mod` footprint's pads,
  a through-hole part's pins on the 0.1 inch grid, and a footprint's name as its package (DIP, pin header, SMD).
  Tested on hand-written fixtures; no KiCad file is shipped.

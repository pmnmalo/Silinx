In short:

- **KiCad parts drawn as they look:** a KiCad part that is drawn only is drawn from its footprint, to scale, on the
  breadboard and in the Parts panel. A SparkFun red LED is a round red body, not a box like a 2-pin connector.

In detail:

- **A KiCad part drawn only by its footprint's drawing (#4315):** `core/kicad-mod.js` reads a footprint's F.Fab
  shapes (F.SilkS when it has none): lines, rectangles, circles, arcs (KiCad 5's too) and polygons, filled or not.
  `core/circuit-kicad.js` keeps them with the part, in grid steps from pad 1, turned as its pins are, and finds an
  LED's colour. `web/js/circuit-draw.js` draws them: the closed shapes are the body, the lines are its marks. A part
  whose footprint is known by its name only keeps its dashed box. Its name goes over the body when it fits, else
  above it (`U2  Red` no longer runs over the body).

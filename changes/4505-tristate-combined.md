In detail:

- **The three-state ICs with combined enables inside (#4505):** the 74365, 74366, 74540, 74541 (G1̅ and G2̅ into a NOR)
  and the 74245 (DIR and OE̅ into an AND, OE̅'s input bubbled, for A to B, and a NOR for B to A) drawn with their
  combining gates as their datasheets draw them, each gate's output the bus of the buffers it enables. No IC of the
  library is left with only its pins named inside; every KiCad catalogue's part that behaves as an IC is drawn.

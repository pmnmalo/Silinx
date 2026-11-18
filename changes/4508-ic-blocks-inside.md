In short:

- **Circuit editor, Show inside:** the flip-flops, latches, registers, counters and the other ICs with no gates are drawn
  as their datasheets' connection diagrams (the 7474's two D flip-flops, a counter's box), in IEEE or IEC symbols, and the
  KiCad parts that behave as them (the 74LS74, the 74HC74…) too.

In detail:

- **The functions inside an IC with no gates (#4508):** `core/circuit-inside-blocks.js` lays out a box a unit of a dual
  or quad flip-flop, latch or decoder (its pins named 1D, 1CLK…, in the half of its pins' row or over the body's height),
  else one box over the body; each pin's line straight into its box, its name in it, a clock's dynamic indicator ▷ (its
  bubble on a falling edge), an active-low input's bubble; IEC 60617-12's labels (1D, 1J, 1K, C1, S, R, a negated
  output's bubble) and qualifier (CTR, SRG, RG, X/Y, MUX, Σ, COMP, BCD/7SEG). A supply pin under a box is drawn into it.
  A test over the library and the KiCad catalogue's parts that behave: every IC drawn inside but #4505's (the three-state
  buffers, the 4023, 4025, 4073, 4075), listed.

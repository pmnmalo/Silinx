In short:

- **Shift registers:** the 7491, 7495, 74166, 74195, 74295, 74594, 74596 and 4021, in the Parts panel and as KiCad's
  parts: they shift in Try it, in the circuit's HDL, simulated and built.

In detail:

- **Shift registers written once in VHDL (#4397, group E):** `core/circuit-model-shift.js` adds 8 shift registers as
  the counters of group D are: each its datasheet's pinout and a VHDL core, run live by Try it, instantiated by the
  circuit's HDL, its Verilog translated by Silinx. The 7495's two clocks are gated by its MODE and the 74166's by its
  clock inhibit, as the chips' logic does; the 74295's outputs are three-state (enabled while OC is high); the 74594
  clears its output register too; the 4021's parallel load is asynchronous. The 74596's outputs are open collectors:
  an IC written once in VHDL may now have them (its core's 1 released, in the engine and in its simulation model). The
  catalogue's KiCad logic ICs that behave go from 197 to 207. The 74299 and 74323 stay drawn only: their I/O pins are
  bidirectional, which a core cannot have yet (#4485).

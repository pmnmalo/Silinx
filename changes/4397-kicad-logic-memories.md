In short:

- **Register files and addressable latches:** the 74670, 74170, 74259, 74256 and 74395, in the Parts panel and as
  KiCad's parts: they store in Try it, in the circuit's HDL, simulated and built.

In detail:

- **Memories and storage written once in VHDL (#4397, group F):** `core/circuit-model-memory.js` adds the 74670 and
  74170 (4 × 4 register files, their words latches written while GW̅ is low; three-state and open-collector outputs),
  the 74259 and 74256 (addressable latches: a latch, a demultiplexer, cleared) and the 74395 (a 4-bit shift register,
  its QA–QD three-state, its QD' not). A KiCad three-state pin fits an open collector of the library (KiCad's 74LS170
  extends its 74LS670). The catalogue's KiCad logic ICs that behave go from 238 to 243. Drawn only: the 74322
  (bidirectional I/O pins, #4485), the 74385 (KiCad's symbol gives half its outputs as inputs), the 74CBT3861 bus
  switches (contacts, as group G's analog switches) and the 74469 (until its datasheet's U/D̅ is checked).

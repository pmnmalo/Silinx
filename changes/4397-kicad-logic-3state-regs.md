In short:

- **Three-state registers and latches:** the 74173, 74373, 74374, 74573 and 74574, in the Parts panel and as KiCad's
  parts, their outputs off (Z) while their output enable is not active.

In detail:

- **Three-state registers and latches (#4397, group C):** `core/circuit-model-ics.js` adds the 74173 (a 4-bit D
  register, its M and N and its G̅1 and G̅2 enables, its clear active high), the 74373 and 74573 (8-bit latches) and the
  74374 and 74574 (8-bit registers), written once in VHDL as the other ICs of the group are. An IC's `threeState` (its
  outputs, their enables) turns its outputs off once an enable is not at its level. The core leaves them out, and the
  engine and the IC's simulation model apply it. In the digital model a disabled output is high, and the circuit's top
  takes the enables as it does the 74595's (now several enables). Its outputs are three-state for Check (#4409). The
  catalogue's KiCad logic ICs that behave go from 158 to 174.

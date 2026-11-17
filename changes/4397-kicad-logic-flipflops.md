In short:

- **Flip-flops, latches and registers from KiCad:** the 74LS109 and 17 more (7473, 7475, 7477, 7478, 74107, 74113,
  74114, 74174, 74175, 74273, 74279, 74375, 74377, 74378, 74379, 4013, 4027) work in Try it, Check and the circuit's
  HDL, as KiCad's parts and in the Parts panel.

In detail:

- **ICs written once in VHDL (#4397, group C):** `core/circuit-model-ics.js` adds 18 flip-flops, latches and registers.
  Each has its datasheet's pinout and a core, a VHDL model of the chip written by small generators (a J-K or D
  flip-flop, a D latch, an S̅-R̅ latch). Try it runs the core live (`coreModel` in `core/circuit-live-model.js`), with
  the chip's power and the reading of its inputs. The circuit's HDL (`core/circuit-hdl-core.js`) instantiates the core
  in its simulation model and in its digital one, and its Verilog is Silinx's translation of the VHDL, never written by
  hand. The translator drops the lint's `silinx: ignore` comments (#4414), so the generator adds them back to the
  Verilog. The catalogue's KiCad logic ICs that behave go from 136 to 158.

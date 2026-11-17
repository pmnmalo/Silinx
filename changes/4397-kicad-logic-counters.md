In short:

- **Counters:** the 74160, 74162, 74168, 74169, 74190, 74192, 74196, 74197, 74290, 74390, 74393, 7492, 74590, 4020,
  4040, 4022, 4029, 4510, 4518 and 4520, in the Parts panel and as KiCad's parts: they count in Try it, in the
  circuit's HDL, simulated and built.

In detail:

- **Counters written once in VHDL (#4397, group D):** `core/circuit-model-counters.js` adds 20 counters as the
  flip-flops of group C are: each its datasheet's pinout and a VHDL core (its count numeric_std's), run live by Try it,
  instantiated by the circuit's HDL, its Verilog translated by Silinx. They are synchronous (74160, 74162, 74168, 74169,
  74190, 74192), ripple (74196, 74197, 74290, 74390, 74393, 7492, 4020, 4040; their stages counting together), the
  74590 (a counter and an output register, its outputs three-state, its RCO̅ not: an IC's three-state outputs may now
  be some of them), the 4022 (8 decoded outputs), the 4029 and 4510 (presettable up/down) and the 4518 and 4520 (dual,
  CLK or ENABLE). An asynchronous load takes its data when it starts, as the 74191's. `core/circuit-model-ics.js`
  takes a core written as VHDL. The catalogue's KiCad logic ICs that behave go from 174 to 197. The 4060's oscillator,
  the 74LV8154 (any one of its byte enables drives the bus), the 74293 (KiCad gives its NC pins 1 and 3 as inputs) and
  the 4033 stay drawn only.
- **VHDL to Verilog: a concurrent assignment's `silinx: ignore` comment kept (#4436):** #4414 kept the lint's
  suppressions on processes and if / elsif branches; a concurrent assignment's (`-- silinx: ignore clock-as-data`
  before `rco_n <= …`, the 74190's) now ends its `assign` line too.

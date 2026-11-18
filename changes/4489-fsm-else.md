In short:

- **A state diagram's @ELSE:** a transition taken in every case its state's other transitions are not can be written as
  Xilinx StateCAD wrote it, `@ELSE`, as well as `else`, `others` or `otherwise`; its Properties have an *Else (every
  other case)* box, and its arc is labelled *else*, in italics.

In detail:

- **The otherwise transition, StateCAD's spelling (#4489):** `@else` (any case), `others` and `otherwise` are a state's
  otherwise transition, as `else`, `default`, `true`, `1` and an empty condition are since #3907: tried last, one per
  state (Check's error lists the new words), the generated HDL's final `else`. A transition's Properties have an *Else
  (every other case)* box: ticked, the condition is `else` and its field not editable; unticked, it is empty. The arc
  of a state's otherwise is labelled *else* in italics, whatever its spelling (an empty condition, `1` or `true` when its
  state has other transitions), and so is its line in the state's list of transitions. The MCP's new
  `set_fsm_condition` sets a transition's condition, or makes it the state's otherwise (`otherwise: true`).

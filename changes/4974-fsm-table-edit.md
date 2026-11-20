In short:

- **A state diagram made from its table:** the transition table of the Tables panel can be edited in place: a row's
  condition, next state and outputs, a row added or removed, a state added or renamed. The diagram and its HDL follow,
  and Undo works as for a drawn change.

In detail:

- **The transition table edited in place (#4974):** `web/js/fsm-table.js` draws the table with a field per cell: the
  present state's name (its first row), the condition (kept as typed, #4888), the next state (a list of the states; the
  "otherwise (stays)" row given another next state becomes a transition `else`), the outputs (`z=1, y=X`: a Moore
  machine's on the state, a Mealy machine's on the transition, #4891); `+` adds a row after a row (a transition from its
  state), `✕` removes one, `+ State` adds a state beside the others. The codes follow the encoding, read only. Every
  change goes through the new `core/fsm-edit.js` and is committed as a change of the diagram (undo, redo, the drawing and
  the HDL made again, Check's problems in the console); a change refused (a name used twice, a value that does not fit)
  is said in the console and nothing changes. A read-only diagram's table stays text. The transition table's rows carry
  their state's and next state's ids (`stateId`, `nextId`).
- **MCP: `edit_fsm` (#4974):** a transition's next state (or a state's otherwise given one), a transition added or
  removed, a state added or renamed, through the same functions; Check's warnings of the machine returned; the
  conditions and outputs keep `set_fsm_condition` and `set_fsm_outputs`.

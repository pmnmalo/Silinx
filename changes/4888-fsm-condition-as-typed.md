In short:

- **A state diagram shows its conditions as you wrote them:** `oper == "000"` typed in the Properties or on the arc is
  drawn as `oper == "000"`, no longer `oper == 3'b000`. The generated VHDL and Verilog still use each language's own
  literals.

In detail:

- **A transition's condition drawn as it was typed (#4888):** the arc, the state's list of transitions and an ASM
  chart's decision box draw the condition's text as typed (`core/expr-notation.js` `drawnAsTyped`), whatever the
  Boolean notation (`"000"`, `=`, `3'b000`, `'1'`, `and`, `&&`). They no longer print it again from its tree in the
  notation, as #4417 had them do. In the Electronics / Engineering notation, a NOT typed as a slash (`/a`, `/(a + b)`,
  the form the conversions write) is still drawn as its bar. The notation still applies to what Silinx derives: the
  transition table, the truth table's results and groups. The stored text, the Properties box, the inline edit and
  the MCP's `set_fsm_condition` and `set_fsm_outputs` already kept what was typed; drawings saved with the normalised
  text are drawn as they were saved.

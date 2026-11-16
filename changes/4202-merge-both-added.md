In short:

- **Pull from GitHub, drawings:** a state, a symbol or a part that both sides added to a drawing is no longer a
  conflict that loses one of them: both are kept.

In detail:

- **A drawing's objects both sides added under one id (#4202):** the editors number new objects one after the other
  (`S7`, `s4`), so two copies that each added one gave it the same id, and the merge by objects saw a conflict whose
  Mine or Theirs dropped one. The merge now gives theirs the next free id, its references (transitions, edges, arcs,
  the initial state) and a repeated automatic name (`S0`, `inst_4`) with it: both kept, no conflict
  (`core/drawing-merge.js` `rekeyTheirs`).

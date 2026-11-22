In short:

- **Truth table: Undo with a names box focused:** Edit ▸ Undo and Redo show the table's inputs and outputs in their
  boxes, the focused one too; leaving the box no longer applies the undone names again.

In detail:

- **The truth table's Inputs and Outputs boxes after an Undo (#5268):** an Undo or a Redo (`web/js/truthtable.js`)
  puts the table's names in every box whose text it changed, the focused one too (its render skips the focused box,
  where a person types): leaving the box fired its change and applied the undone text again; a box the step did not
  change keeps what is typed in it. Test: truthtable (UI, Undo and Redo with the Outputs box focused, the box left, a
  shape typed in the Inputs box then).

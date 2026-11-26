In short:

- In a project shared live, an editor's Edit ▸ Undo undoes the editor's own project commands too (New Source, Rename,
  Remove from Project…), merged so that the owner's and the other editors' later changes stay.

In detail:

- **An editor's own project commands undone (#5760, part of #5743):** following a project replaced the api's functions
  that the project's history (`web/js/history.js`) records through, so an editor's commands were never recorded.
  `history.attach()` now records through the backend api stands for while following (the room's: collab-follow.js),
  its Undo / Redo merged three ways and written into the shared document as the owner's are (#5739,
  `web/js/history-shared.js`), and `detach()` gives the page's own backend back when following ends
  (collab-leave.js); the steps of the other backend are forgotten either way. Tests: history, the UI's collab-undo
  (both interfaces, Portuguese).

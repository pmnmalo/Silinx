In short:

- In a project shared live with editors, the owner's Undo / Redo of a command (Rename, Convert, Remove from Project,
  New Source…) reverts that command's own change only: what the editors changed since stays. Where their change
  touches the same lines, objects or settings, nothing is undone and the console says why.

In detail:

- **Each participant's own Undo in live editing (#5739, phase 1 of #5743):** the text editors and the drawings bound
  live already undid one's own changes only; the project's history (`web/js/history.js`) wrote each file's whole text
  back, losing what the editors had changed since (behind a "those changes are lost?" question). In a shared project an
  Undo / Redo of a command is now merged three ways into the project as it is now (`core/history-merge.js`, on
  Merge Contribution's `compareProjects` / `mergeProjects`: a text file by its lines, a drawing by its objects,
  silinx.json by its fields, a renamed file's later changes carried back), written through the shared project so that
  everyone sees it; an overlap refuses it with a warning (`web/js/history-shared.js`). An unshared project's Undo is as
  before. The owner's save of a file its editor has open no longer puts a text read before an editor's change arrived
  into the shared document (the change was lost), and an editor's change written meanwhile is never recorded into a
  command of the owner's. The project's Undo has no MCP tool yet: the merge is in `core/` for the versions' restore and
  undo tools of #5740. Tests: history-merge, history, collab-undo (both interfaces, Portuguese).

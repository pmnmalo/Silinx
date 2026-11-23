In short:

- Edit ▸ Undo clicked right after Remove from Project's question undoes the removal every time.

In detail:

- **Undo right after Remove from Project (#5263):** a project command started while the one before was still
  ending (New Source's step being made as Remove from Project's question opened) lost its end to the one before:
  `web/js/history.js` cleared the shared "command running" promise when the earlier command ended, so an Undo clicked
  as the question closed did not wait for the removal and undid nothing, though the Edit menu said Undo Remove from
  Project. A command's end now clears only its own. Tests: history (a command started while the one before ends, an
  Undo during it), the UI's undo (Undo right after the question, the command before still ending, the project's reads
  held: the removal undone, its lines and no warnings, both interfaces); usability project-lifecycle (Undo at once
  after Remove from Project, without waiting for the page to settle).

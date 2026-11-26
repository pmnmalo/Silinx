In short:

- The Design pane selects several sources: Ctrl+click (Cmd+click on a Mac) and Shift+click, as in ISE; Remove from
  Project (its menu, or Delete) removes them all at once.
- Remove from Project asks whether to keep the files in the project folder or to delete them too.

In detail:

- **Several sources selected in the Design pane (#5720):** Ctrl / Cmd+click adds a row to the selection or takes it
  out, Shift+click selects the rows from the last one clicked, a plain click or Esc goes back to one row; the rows are
  marked and `aria-selected` (the tree `aria-multiselectable`), the Processes pane following the row clicked last. The
  menu of a selection has Open and Remove from Project for them all, the commands of one source disabled; Delete
  removes the selection, or the row selected (`web/js/design-select.js`).
- **Remove from Project keeps or deletes the files (#5720):** its question names the sources and offers Remove from
  Project (the default: the files stay in the project folder) or Remove and Delete File(s) (deleted as Delete File
  does, into the workspace's .trash); a drawing's HDL file goes with it, the console says what was removed and what
  was deleted, and one Undo brings it all back (`web/js/design-remove.js`). The MCP's `remove_from_project` takes several
  files (`paths`) and `delete`, with the same messages (`core/project-entries.js` `removedMessage`). Tests:
  design-multi-select (both interfaces, Portuguese), mcp-sources, project-entries; the UI tests that answered the
  question's Yes answer Remove from Project.

In short:

- Open Project deletes projects: select one or several in its list (Ctrl+click, Cmd+click on a Mac, Shift+click, the
  keyboard, a long press on a touch screen) and press Delete; it asks first, as the deletion cannot be undone.

In detail:

- **Open Project's Delete (#5785):** the list of the projects selects several (Ctrl / Cmd+click toggles one,
  Shift+click a range, the arrows and Shift+arrows, Ctrl / Cmd+A, a touch's long press and then taps; the rows
  `aria-selected`, the list `aria-multiselectable`); Open stays for one project (double-click, Enter), Delete (the
  button or the Delete key) takes one or more. Its question names the project or lists them, says where they go (the
  workspace's .trash, or gone from the browser's storage) and that it cannot be undone, Cancel the default; the open
  project is closed first, said in the console; one whose process runs, shared live or followed is refused, why in the
  console. Each deletion's line in the console (`web/js/open-project-delete.js`, `core/project-delete.js`).
- **`delete_project` deletes several projects (#5785):** `projects` instead of `project`, every one checked before any
  is deleted; the local server's delete (Open Project's and the MCP's, `server/project-delete.js`) refused while a
  process of the project runs or it is shared live, with the interface's messages. Tests: project-delete,
  mcp-sources, the UI's open-project-delete (both interfaces, Portuguese).

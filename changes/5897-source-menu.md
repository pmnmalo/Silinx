In short:

- A source's right-click menu in the Design pane: **Remove…** right after Duplicate… (it asks, as before, whether to keep
  the file in the project folder or delete it too); no Share Module… any more: Share Project… chooses the module in its
  window.

In detail:

- **A source's menu (#5897):** a module's, a file's, each drawing's badge's and a selection's menus have Remove… after
  Duplicate… (Remove from Project before, at the end; "Remover…"), its command still named Remove from Project (Edit ▸
  Undo, the version kept before it, #5740: `web/js/ui.js`'s menu items take a `command`). Share Module… leaves the module's
  menu and the Simulate tree's test bench menu, in both interfaces; Share Project…'s window chooses the module, the view
  and a test bench as before.

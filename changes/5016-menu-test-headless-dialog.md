In detail:

- **The menus' UI test names a dialog with no title bar (#5016):** the command palette is one of ui.js's dialogs since
  #4762, with no title bar (its name its aria-label), so the test walking every menu item reads that name instead of
  failing on the title it does not have (the ISE interface's View ▸ Command Palette…).

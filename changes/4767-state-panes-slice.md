In detail:

- **The page's state, the selection and the panes' slice (#4767):** the Design pane's selection and its row, the
  Processes panel's process and collapsed groups, the left pane's page, the trees as the user left them, the menus and
  the FPGA view's syncing are web/js/state-panes.js's, which their modules read and write; web/js/app.js's `S` keeps those
  nine fields as getters and setters onto it, as before.

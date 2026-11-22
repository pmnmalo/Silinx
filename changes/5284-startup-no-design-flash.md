In short:

- Opening Silinx no longer flashes the Design pane's "No project open" before the Start page.

In detail:

- **No Design page seen at start-up (#5284):** the page starts on the Start page (`web/index.html`) instead of the
  Design page, whose tab is hidden while no project is open: the Design pane's "No project open · New Project… · Open
  Project…" (with the Silinx interface's design bar, the ISE style's View and Processes) no longer shows for a moment
  before the Start page replaces it, in the local server's edition and the browser edition. A project reopened at
  start-up, or opened before any page was chosen, is on its Design page unless its kept view shows another (without
  saving the view before it is read). The Design pane's empty state is gone (unreachable since the Design tab is hidden
  with no project, #4257; New Project and Open Project are the Start page's, #1216, and the File menu's), and the
  Collaboration tab hidden with no project falls back to the Start page. Tests: the UI's startup-no-flash (the side
  panel's page watched from the first script: the Start page only with no project, in both editions; the Design page
  only for a project reopened; the Design pane empty after Close Project; no warnings; fails on the old code), projects
  (Close Project: the Design pane empty and hidden).

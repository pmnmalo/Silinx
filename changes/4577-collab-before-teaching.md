In short:

- **The side panel's tabs:** Collaboration now comes before Teaching (Start, Design, Files, Libraries, Collaboration,
  Teaching), in both interfaces.

In detail:

- **The Design pane's tab row: Collaboration before Teaching (#4577):** the two tabs and their pages swapped in
  `web/index.html`; only the tab last chosen is kept, not the order, so nothing to migrate; the UI tests of the row
  (left-tabs-no-project, teaching-tab, collab-tab) assert the new order.

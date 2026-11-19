In short:

- **Start and Collaboration, both shown whole with no project open:** the two tabs share the side panel's row, each
  with its name, so it is clear that there are two.

In detail:

- **The side panel's tabs with no project open (#4625):** Start and Collaboration (#4619) both whole (their icon and
  name) and sharing the row's width, in both interfaces (`web/js/left-tabs-fit.js`); where the panel is too narrow for
  both names, the tabs as with a project: the active one whole, the other its icon (the Silinx interface) or its name
  cut (the ISE style). Measured again when the panel is resized, a project opens or closes, or the language changes.

In short:

- **Circuit editor, Parts panel:** Import KiCad Part… and Browse KiCad Libraries… are in the KiCad catalogue's section,
  under its heading; the panel's top holds only the search.

In detail:

- **KiCad's actions in the KiCad catalogue's section (#4534):** `web/js/circuit-parts-panel.js` puts Import KiCad
  Part… and Browse KiCad Libraries… in a row under the KiCad catalogue's heading (`.circ-cat-tools`), shown when the
  section is folded too, rather than under the search at the top of the Parts panel. Neither shows in a read-only editor,
  and Browse only on the local server, as before. The MCP server's tools (`import_part`, the catalogue's) are unchanged.

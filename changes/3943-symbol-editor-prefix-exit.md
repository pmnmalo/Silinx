In short:

- **The Symbol Editor says so:** its toolbar starts with "Edit Symbol", as the schematic's Try it shows its own, and
  an Exit button after the zoom closes it.

In detail:

- **The Symbol Editor's "Edit Symbol" badge and Exit button (#3943):** the toolbar starts with an "Edit Symbol"
  badge, the schematic's Try it badge (`.lv-badge`), so it is not taken for the Schematic editor; Exit, after the
  zoom group, closes its tab as the tab's × does (its changes saved first; if they cannot be, the Close prompt).
  docs/UI-GUIDELINES.md says when an editor's toolbar starts with what it is. Portuguese ("Editar Símbolo", "Sair").

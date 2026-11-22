In short:

- Rename… of a module or a file keeps the editors' tabs where they were and the one in front in front.

In detail:

- Rename… closes the editors of the files it changes and opens them again: they now come back in their tabs' places
  (the renamed file's under its new name), on their side of a split and in their task, the editor in front before kept
  in front, and the renamed file's cursor kept; they came back at the end of the tab bar, the last one in front
  (web/js/rename.js, #5250).

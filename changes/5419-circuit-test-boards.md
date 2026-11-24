In detail:

- The Circuit editor's UI test expects the Parts panel's Boards group in Portuguese (Placas), listed in the development
  build since the boards became a circuit's parts (#5215); its list had not been updated, so last night's CI failed in
  both interfaces (ui part 2/4). Tests: circuit (the UI's, both interfaces) (Fixes #5419, Fixes #5421)

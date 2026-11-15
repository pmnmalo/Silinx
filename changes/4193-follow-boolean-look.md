In short:

- **Live sharing: the Boolean algebra followed as the owner sees it:** their SOP or POS, their Karnaugh map and
  Quine-McCluskey's steps shown are followed, and a follower's map no longer closes when the owner changes the table.

In detail:

- **A followed drawing changed in place, a truth table's look followed (#4193):** a follower's page applied the
  owner's change of a drawing by opening it again from its file, its editor made again with its view's defaults (a
  truth table's Karnaugh map and Quine-McCluskey's steps closed); it is now put in place, its view kept
  (`web/js/project-watch.js`). The truth table's SOP / POS (the map's and Quine-McCluskey's), its map and steps shown
  and the output in front are sent with the owner's selection (#4192) and followed.

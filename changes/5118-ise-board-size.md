In short:

- **The Board Emulator's board at the same size in both interfaces:** the ISE style interface fits the board to the
  window as the Silinx interface does (larger on a large screen, smaller on a small one), instead of always drawing it
  at its own size.

In detail:

- **The ISE style interface's emulator board fitted to its room (#5118):** `web/js/tasks-emu.js` fits the board of
  every open emulator in the ISE style interface with the Silinx interface's rule (`boardZoom`: its room, from 0.7 to
  1.5), refitted when the window or the workspace change and when its board appears (the observer of a new board
  watching in both interfaces); `.emu-board-wrap` is `flex: none` in both. A Basys2 in a 1400×900 window is 731×484 px
  in both interfaces (840×556 before in the ISE style one), in a 2560×1600 one 1260×834 px.

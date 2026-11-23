In short:

- **Emulate on a tablet in portrait:** the Emulate page shows Emulate on Board while no board is open; its side
  panel was folded, with nothing to tap to start the emulator.

In detail:

- **Emulate's side panel on a narrow screen (#5299):** in the Silinx interface it is shown while none of the task's
  documents is open, folded once the board opens (the board's room, #1463) and shown again once it is closed
  (`web/js/tasks.js`, `arrangement`'s `empty`).

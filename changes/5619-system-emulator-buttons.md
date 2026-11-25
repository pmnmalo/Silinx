In short:

- **The System Emulator's push-buttons no longer stay pressed:** it starts running as soon as it is ready, as the Board
  Emulator does. A Basys2's button clicked is let go once its design has seen it.

In detail:

- **The System Emulator runs once ready (#5619, `web/js/system-emu-view.js`),** as the Board Emulator does.
  - The cause: a button let go is held down until the design has seen a real press, 100 ms of the board's time (#3109),
    and while paused until the design has run (#5331). The System Emulator opened paused, so a button clicked before ▶
    Run stayed pressed.
  - Power cycle keeps it running if it was.
  - A run in flight on the old worker is dropped, so Step works at once after a Power cycle.
- **A press's length at a slower rate:** below real time, the buttons get the System Emulator's speed, its rate's cycles
  a second. A press lasts 100 ms of the user's time, as at the Board Emulator's set speeds (`pressEnd`), not 100 s at
  1/1000.

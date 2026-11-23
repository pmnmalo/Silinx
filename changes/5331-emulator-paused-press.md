In short:

- The Board Emulator keeps a button clicked or tapped while it is paused: the design takes the press when it runs
  again (the stopwatch's BTN0 clicked while paused starts it on Run).

In detail:

- **A push button pressed while the Board Emulator is paused (#5331):** a click or a tap let go while paused was let
  go at once (#3109), down and up again while no clock cycle ran, so the design never saw it. It is now kept down, lit,
  as a click while it runs, until the design has run with it for a real press's time (`core/emulate-press.js`
  `pressEnd`), on both engines, by the mouse, on the board's buttons and on the phone's strip; pausing no longer lets
  the buttons held down go, a power off or a power cycle does (`web/js/emulator.js`, `web/js/emulator-board.js`). The
  System Emulator, which mounts the same buttons, keeps them while paused too and lets them go on a restart. The user's
  guide (EN, PT) explains the buttons' press, the pause and Shift+click. Tests: ui/emu-paused-press (compiled and
  event-driven engines, mouse and touch, failing on the old code; the console's one synthesis warning, no other),
  ui/emulator-parts (#3109's paused click: kept down after a Step, let go by a power cycle), usability tablet (BTN0
  tapped while paused starts the stopwatch on Run).

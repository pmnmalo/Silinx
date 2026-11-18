In short:

- **Board Emulator:** a push button clicked just before a power cycle is let go by it, no longer seen by the design
  after the reset.

In detail:

- **A power cycle lets a held push button go at once (#4437):** a button clicked while the compiled engine's run was in
  flight and let go waited for that run before its release was counted, and a power cycle in between kept it held for
  the first run after the reset, long enough on a slow page for the design's debouncer to take the old click
  (`core/emulate-press.js`: the board's time gone back releases it before anything else).

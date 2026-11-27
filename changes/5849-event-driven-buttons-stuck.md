In short:

- **Board Emulator:** with the event-driven engine, a push button clicked and let go no longer stays pressed for up to a
  minute and a half: it is let go within a second, on every board.

In detail:

- **Board Emulator: a button let go held down a second at most (#5849):** a button let go is held down until the design
  has seen a real press, 100 ms of the board's time (#3109), but never longer than a second of the user's time at the
  rate the board runs (`core/emulate-press.js` `pressEnd`'s `rate`, `HOLD_MAX_MS`; the emulator's measured cycles a
  second, a pause's time no longer counted in it). The event-driven engine, at some 50,000 to 160,000 cycles a second,
  had held it for the 5,000,000 cycles of 100 ms at 50 MHz, 30 to 100 seconds; the compiled engine, down to a tenth of
  real time, keeps the whole press. Every board's buttons are the same (`mkButton`). The user's guide (EN, PT). Tests:
  emulate-press (the rate's cap; the event-driven engine's button back at 0 within a second), the UI's
  emu-buttons-event (13 boards of every family on the event-driven engine; on the Basys2 a click again, a long press,
  a release away from the button, a pointer cancel and a finger on the phone's strip), both interfaces.

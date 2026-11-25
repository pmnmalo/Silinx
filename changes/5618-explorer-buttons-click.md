In short:

- **The Explorer 16/32's buttons take a click:** in the System Emulator, a click on S3 to S6 now reaches the PIC24, as a
  press held down does.

In detail:

- **A click on an Explorer 16/32's button reaches the PIC24 (#5618):** its press and its release both reached the
  System Emulator's worker before its next run, so the PIC24 never saw the press; a button let go is now held down
  until the PIC24 has had it for a real press (100 ms of the boards' time, core/emulate-press.js pressHolds), as the
  Board Emulator's buttons are (#3109); its release on the button itself (its pointer captured). A UI regression test
  clicks, then holds and lets go, each button with the mouse where it is drawn, the PIC24 reading it, in both themes.

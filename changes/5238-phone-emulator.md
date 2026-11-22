In short:

- **Phones:** the Board Emulator fits the board to the phone's width, its switches and buttons repeated under it,
  large enough for a finger.

In detail:

- The Board Emulator on a phone, the fifth phase of #5121 (#5238): under 600 px the board is fitted to the width
  (`boardZoom` of `web/js/tasks-emu.js`, a phone's floor 0.3 instead of a tablet's 0.7), with no sideways scroll, and
  its switches and buttons are repeated under it, 44 px at least, in the board's order, each with its name and the
  design's bit it drives (`web/js/emulator-touch.js`): a tap toggles the board's switch, a finger held on a button
  holds the board's button down until it is lifted, the strip following the board. The phone's pane follows what is
  opened on every screen, so a window turned into a phone's shows what the user was at (`web/js/phone.js`). UI tests at
  375 × 812 and 430 × 932 with touch, both interfaces, Portuguese (`test/ui/phone-emu.test.js`); `boardZoom`'s phone
  cases (`test/tasks.test.js`).

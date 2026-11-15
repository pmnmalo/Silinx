In short:

- A part of the circuit editor turned 90°, 180° or 270° is drawn turned whole: its body, its notch, its levers and lights
  with its pins, its labels upright.

In detail:

- **Turned parts drawn right (#4114):** a part was drawn from its turned pins' box with the unturned part's offsets (an
  IC's body and notch, a switch's or a button's body, the supply's, the clock's, a DIP switch's levers, a display's
  segments, a probe's pen wrong at 90° and 270°, on the wrong side at 180°). Every part is now drawn unturned and turned
  whole about its place, as its pins are, and as a breadboard already was (#4065); its texts stay upright (a breadboard's
  letters and numbers too), a part's name starting away from its body when it ends up beside it. UI test
  `circuit-rotate` (every kind of part at the four turns: its drawing the unturned one turned, its pins on its pins, its
  texts upright, its name clear of its body; an IC turned by the toolbar's Turn) in both interfaces.

In short:

- **Digital circuits, more parts:** the full breadboard, slide and DIP switches, a clock source ticking in real time,
  pull-ups and pull-downs, 7-segment displays, an LED bar, more 74LS gates (open collector ones too) and the 4000 CMOS
  gates, in the circuit editor's library; tried live (a click on a DIP lever, the clock blinking). In Portuguese too.

In detail:

- **The circuit editor draws phase 2's parts (#3899, part of #3897):** `web/js/circuit-draw-parts.js` (a slide switch,
  a DIP switch's levers each a click while trying it, a clock source, pull-ups, a 7-segment display's segments, an LED
  bar's lights; a full breadboard's split rails); Try it ticks each clock at its frequency in real time; the library's
  groups (the 74LS and the 4000 gates); the Properties: a switch's position as saved, a DIP switch's levers, a clock's
  frequency, a display's colour and pinout, first in the panel (then the library); Portuguese for every part's title.

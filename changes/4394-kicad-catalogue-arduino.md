In short:

- **Arduino boards in the KiCad catalogue:** the Arduino Nano, Micro, Mini, MKR and Nicla boards that plug into a
  breadboard, drawn only.

In detail:

- **The KiCad catalogue's Arduino boards (#4394):** `scripts/kicad-catalogue.mjs` adds the boards of the KiCad PCM's
  KiCad Library for Arduino Modules v4.2.0 (CC-BY-SA-4.0) whose pins fit the 0.1 inch grid: 32 sockets, but no
  shield. They are drawn only, because Silinx does not simulate a microcontroller. Like KiCad's own footprints, none
  of their drawings is kept, only their pads' places. A footprint whose pads are named by its pins (A0, 5V, D13) and
  that has no pad 1 takes its first named through-hole pad as its origin (`originPad` in `core/kicad-mod.js`). It used
  to be "no pad 1 through the board". The same rule adds SparkFun's triple LED.

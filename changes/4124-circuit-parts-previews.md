In short:

- The circuit editor's Parts panel draws the power, input and output parts at their size, centred, with their marks
  (the supply's +5V and GND, a pull-up's or pull-down's arrow).

In detail:

- **The Parts panel's drawings fitted (#4124):** a part that is not an IC was fitted to its pins and a guessed margin, so
  the supply, the pulls, the switches and the LED were drawn tiny in a corner of their boxes, and their texts were all
  left out. Each is now fitted to its own drawing's box (measured once), centred, a small part magnified 1.2 times at
  most; only its name is left out. UI test `circuit-parts-panel` (every such drawing centred and filling its box, the
  supply's and the pull-up's marks) in both interfaces.

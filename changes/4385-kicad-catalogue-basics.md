In short:

- **The KiCad catalogue's basic parts:** KiCad's own LED (it lights in Try it), resistor, capacitors, diode,
  potentiometer, the 2N3904, 2N3906, BC547 and BC557 transistors, the 7805 regulator, a DIP switch and a 7-segment
  display, each ready for a breadboard.

In detail:

- **KiCad's own basic parts in the catalogue (#4385):** `scripts/kicad-catalogue.mjs` takes them from KiCad 9.0.0's
  Device, Transistor_BJT, Regulator_Linear, Switch and Display_Character libraries, each with the through-hole
  footprint Silinx picks for it (a 2.54 mm TO-92, not the 1.27 mm one). The import writes it as the symbol's
  `Silinx.Footprint`. Their previews are a box round their pads: KiCad's footprints are CC-BY-SA-4.0, so none of their
  drawings is kept. A pad within 0.1 mm of the 0.1 inch grid is on it (it was 0.01 mm), so KiCad's capacitors (2.50 and
  5.00 mm) fit. That also adds SparkFun's 5 A relay and its 12 mm push button, which behaves as the library's button.

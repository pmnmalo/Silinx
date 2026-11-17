In short:

- **KiCad LEDs, slide switches and push buttons work in Try it:** a KiCad LED (SparkFun's red and green 5 mm LEDs in the
  catalogue) lights in its colour, and a slide switch or a push button is clicked, as the library's do.

In detail:

- **KiCad parts that behave as the library's LED, slide switch and push button (#4349):** `core/circuit-kicad-parts.js`
  knows them by `Silinx.Model` (`led`, `spdt`, `button`) or by what their symbols say. It matches their pins by name
  (an LED's A and K, whatever their numbers), by number (a button's) or by place (a slide switch's middle pin, its
  common). Each pin keeps its footprint's place and the library part's number, so the simulation, Check and the HDL
  treat them as the library's. An LED's colour is its own. Their drawing shows the LED lit, the switch's lever and the
  button's cap. Part info says what they behave as. Import KiCad Part… and `import_part` offer the three models. The
  catalogue's SparkFun LEDs and slide switches are listed as the LED and the slide switch of the library.

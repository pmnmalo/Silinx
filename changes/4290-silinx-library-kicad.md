In short:

- **Silinx's library in KiCad's format:** Export Parts as KiCad Package… can add all the library's parts, not only its
  ICs: the switches, the button, the LEDs, the displays, the supply and the probe too, with their footprints. KiCad
  installs the package, and Silinx imports it back with every part's pins where they were.

In detail:

- **Silinx's library in KiCad's format (#4290):** every part of the library with pins becomes a KiCad symbol (the ICs as
  in #4282; the others `Silinx_<type>`, one unit, `Silinx.Model`). A display, an LED bar or a DIP switch gets KiCad's DIP
  footprint, and every other part a generated one (`Silinx.pretty`) with its pads at its pins' places. The package
  dialog offers "With the library's parts (129), their footprints too"; the MCP's `export_part` takes `parts` or
  `all_parts` for a `.zip`, with no project needed. Read back, the ICs, the LED, the button and the slide switch behave
  as the library's. The other parts are drawn only, each with a note: a symbol whose `Silinx.Model` names one of them
  was refused before and is now drawn only. The library is generated at each export, not kept as a file.

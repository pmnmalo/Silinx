In short:

- **Parts panel, IEC symbols:** every MSI IC's thumbnail shows its general qualifier, as its tip's card does (BCD/7SEG
  on two lines, a tall multiplexer's MUX smaller); the priority encoders show HPRI/BIN.

In detail:

- **A thumbnail's qualifier always drawn (#4531):** `symbolPreview` (`web/js/sch-palette.js`) left an MSI IC's
  qualifier out of its 54 × 34 thumbnail when it did not fit at 6 px, so the row and its tip's card differed (the 7446's,
  7447's and 7448's BCD/7SEG, the 74151's MUX, the 4021's SRG). It is now drawn on two lines at its '/' when that fits,
  else smaller, down to 4 px. `qualifierOf` (`core/circuit-inside-blocks.js`) gives the priority encoders HPRI/BIN, an
  arithmetic logic unit ALU and a carry generator CPG, as their datasheets' IEC symbols do.

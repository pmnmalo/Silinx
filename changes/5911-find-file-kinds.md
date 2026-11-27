In short:

- **Find in Project:** searches circuits, register maps, every family's constraints files (XDC, PCF, LPF, CST, CCF,
  QSF) and the C, C++, assembly and Python sources too.

In detail:

- **Find in Project, every source (#5911):** `core/find.js` takes the project's text sources by the same rule as the
  rest of Silinx (an HDL, C, C++, assembly or Python source by `sourceLang`, a constraints file by `CONSTRAINTS_FILE`, a
  memory or firmware file) and the circuits' and register maps' drawings, in the page and the MCP's
  `find_in_project` alike; a circuit's or a register map's HDL marked as generated from its drawing.

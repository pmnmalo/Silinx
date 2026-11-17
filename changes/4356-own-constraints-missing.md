In short:

- **Import of a Silinx zip:** a zip whose silinx.json names a constraints file of its own that it doesn't contain is
  reported again ("files listed in silinx.json but not in the zip"); a new project's, not written yet, still isn't.

In detail:

- **A constraints file not in the zip is missing, but the device's default (#4356):** #4288's fix stopped counting
  silinx.json's `constraints` as missing at all; the import (the server's `importProjectEntries`, File ▸ Import Project…
  and the MCP's `import_project`; the browser edition's `projectFromZip`) now leaves out only the device's default
  path, `constraints/top<ext>` (`.ucf`, `.pcf`, `.lpf`, `.cst`, `.xdc`), which a new project names before its file is
  written. Tests: project-zip, project-store and mcp-transfer (a file of its own and the default, on a Spartan-3E and
  an iCE40), server (its test of a constraints file the zip does not contain, failing since #4288), the UI test
  projects (the warning, in both interfaces).

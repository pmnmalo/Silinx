In short:

- **Add to Project of any constraints file:** a PCF, LPF, CST, CCF or XDC added to a project with no constraints file is
  its constraints, as a UCF was (the iCE40, ECP5, Gowin, GateMate and 7-series boards).
- **Live share:** an editor can edit an iCE40's, ECP5's, Gowin's or GateMate's constraints file.

In detail:

- **Add / Remove from Project, a file written, the missing tops: one implementation (#4733):** `core/file-kinds.js`
  (a file's language, a constraints file of every format, a test bench's role) and `core/project-entries.js` (Add to
  Project, Remove from Project, a file written, the tops a removal leaves missing), used by the interface, the MCP
  server, both projects' stores and the live share, which each had their own copy. Add to Project made only a `.ucf`
  the constraints file; the MCP's `remove_from_project` reset an HLS project's top that the interface keeps (a C
  source whose HDL cannot be made for now, #2995); the live share could not edit a `.pcf`, `.lpf`, `.cst` or `.ccf`;
  the server's store did not count a `.ccf` as constraints; a module named in a comment no longer keeps a removed top.

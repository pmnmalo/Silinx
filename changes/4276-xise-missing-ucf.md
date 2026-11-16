In short:

- **Export to Xilinx ISE of a new project:** a project whose constraints file isn't written yet no longer lists it in
  the .xise, which ISE missed and Import Project… warned of ("files referenced by the .xise but not found").

In detail:

- **The .xise lists the constraints file only when it is there (#4276):** `exportXise` takes `exists(path)` and leaves
  out a constraints file it says is not there (a new project's `constraints/top.ucf`, not written yet); with no `exists`,
  listed as before. Every export passes it: File ▸ Export Project (.zip)… to Xilinx ISE (the server's
  `exportProjectZip`, the MCP's `export_project`, the browser edition's), the `export.xise` route and the .xise sync.
  Tests: server-units (`exportXise`), project-zip and mcp-transfer (a new project exported and imported back, no
  warnings; its UCF written, listed and imported with it), server-api (the route and the sync), the UI tests projects
  and standalone (the server and the browser editions, in both interfaces). The same project's Silinx zip imported back
  still names its constraints file as missing: #4288.

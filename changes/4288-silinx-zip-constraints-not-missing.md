In short:

- **A new project's Silinx zip imported back:** a project whose constraints file isn't written yet no longer warns
  "files listed in silinx.json but not in the zip: constraints/top.ucf" when its Silinx zip is imported.

In detail:

- **The constraints path is not a missing file (#4288):** silinx.json's `constraints` is where the project's
  constraints file is or will be (a new project's `constraints/top.ucf`, not written yet), not a file the project lists:
  the import of a Silinx zip (the server's `importProjectEntries`, File ▸ Import Project… and the MCP's
  `import_project`; the browser edition's `projectFromZip`) no longer counts it as missing when the zip has none, as the
  .xise leaves it out (#4276); the files silinx.json lists are still checked. Tests: project-zip and mcp-transfer (a new
  project's Silinx zip exported and imported back, nothing missing, no warnings), project-store and server-api, the UI
  tests projects and standalone (the server and the browser editions, in both interfaces).

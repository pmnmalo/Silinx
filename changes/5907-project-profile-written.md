In short:

- **Projects saved with a byte order mark:** a project whose silinx.json an editor saved as "UTF-8 with BOM" opens in
  the browser edition's workspace folder too.

In detail:

- **silinx.json version 2: what a project is written once (#5907, the architecture audit #5902):** its `profile`
  (`logic`, `fpga`, `embedded`, `system`) is written for every project, and the old `kind` (`design`, `system`) never
  again; the mode (Circuit, Board, System, #5753) is read from the profile as before. A description of version 1 is read
  through its migration (`core/project-migrations.js`, the documents' registry's first: its kind as its profile, its
  files a list), in memory, by every reader (the local server, the browser edition's
  stores, an imported project); it is written in version 2 on its next save, and a version of the project
  (`before-migrate`) holding it as it was is kept first; Rename Project leaves it as it was. Every example, test design
  and fixture opens in the same mode and profile as before.
- **A silinx.json with a byte order mark in the browser edition's workspace folder (#5914):** read as the local server
  reads it (#4755), its mark skipped, where before the project was said not found.

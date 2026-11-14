In short:

- **Import Project: a Silinx project from its folder:** a Silinx project imports from its folder (the one with its
  silinx.json) as well as from a .zip, in the same rows as a Xilinx ISE project's; the folder picked chooses its
  software, as a zip does.

In detail:

- **A Silinx project imported from its folder (#3965):** Import Project (.zip)…'s Silinx choice has the Xilinx ISE
  one's rows (Project folder:, or .zip file:, Project name:); a folder is imported as the .zip of the same project
  (its files but the hidden ones and its build folder, `core/project-folder.js`), through the same import gate and
  messages; a folder picked preselects its software, a folder of no project says so; in Portuguese. The MCP server's
  `import_project` leaves a Silinx project folder's build folder out too. Export Project's Silinx hint ends "It opens
  in Silinx.".

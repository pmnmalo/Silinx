In short:

- Co-design: an Arduino's firmware can be an `.elf` (avr-gcc's) in the page's Try it too, not only a `.hex`.

In detail:

- The page reads a project file's bytes (the local server's `GET /projects/:p/file?bytes=1`, server/projects.js
  `readFileBytes`, by a file's text's checks and messages; the browser edition's workspace folder: its file's bytes;
  the browser's own storage, which keeps text only, refuses it with a message that says so), and the System's Try it
  reads an `.elf` firmware so, as the MCP server's `simulate` of a System now does through the same `readFileBytes`
  (#5198).

In detail:

- **compile keeps the parses (#4773):** src/compile.js reuses a file's parse while its path, language, text, the texts
  it includes and the SystemVerilog package types it was read with are the same (the last 512 files'; what compile adds
  to a parse goes on a copy), so that a check run again as one types parses the file changed only; parseStats() counts
  the files parsed and the parses reused.

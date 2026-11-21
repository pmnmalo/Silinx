In detail:

- **compile keeps the parses (#4773):** src/compile.js, with `keep`, reuses a file's parse while its path, language,
  text, the texts it includes and the SystemVerilog package types it was read with are the same (the last 512 files';
  each compile gets a deep copy, so that what compile, the library and the elaboration change in it never reaches the
  parse kept), so that a check run again as one types parses the file changed only; parseStats() counts the files
  parsed and the parses reused. Without `keep`, every compile parses as before.

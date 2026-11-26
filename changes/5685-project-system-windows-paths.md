In detail:

- **`test/project-system.test.js` on Windows (#5685):** the corpus's files listed with `/` between their folders, as the
  stores give them (readdirSync's are `\` there), so an FPGA node's constraints file is found; a regression test with
  Windows paths runs on every system.

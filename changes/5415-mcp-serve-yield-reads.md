In detail:

- **mcp-serve's #5065 test no longer depends on the machine's speed (#5415):** it counted the reads against the
  simulation's yields (40 reads in fewer than 20 yields), which a loaded runner failed (40 over 20); it asserts that
  one of the simulation's yields lets two reads through, which a yield that does not wait for the file system
  (setImmediate's) never does, however fast the machine.

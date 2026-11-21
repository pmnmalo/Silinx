In detail:

- **Another project's MCP call during a simulation answered at once (#5065):** a simulation running in the MCP server
  yields to the event loop with a timer, not `setImmediate`, so the event loop waits for the file system there: another
  call's reads go through several at each yield, not one a yield (`project_info` of another project took about 5 s
  during a simulation, now about 1 s; the simulation no slower). The tests that timed out under load wait for events or
  have a budget that fits: mcp-serve's #4734 test waits for the simulation to run (`SIM_TESTING.onRun`), not 300 ms, its
  budget scaled by `SILINX_UI_THROTTLE`, and counts the yields in a new test; mcp-gatemate's post-synthesis simulation
  has the longest time limit.

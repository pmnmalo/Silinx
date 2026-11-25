In detail:

- **A System's controls resolved in `core/system-controls.js` (#5602):** the MCP simulate's `controls` (a board's switch
  or button, a circuit's part, an Explorer 16/32's button, R6 or TC1047A, each at its time) are resolved there, moved as
  they were from `server/mcp-system-sim.js`. Nothing changes; Simulate's stimulus file (#5581) uses it in the browser too.

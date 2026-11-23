In detail:

- **The MCP System simulate's test expects a circuit node's servos (#5371):** since the servo SG90 (#5347) a circuit
  node's output has `servos` beside its `sensors`, and `test/mcp-system.test.js`'s #5322 test compared it without them.
  Test: mcp-system.

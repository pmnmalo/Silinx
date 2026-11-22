In detail:

- **MCP: `set_output_logic`'s schema of the kinds checked (#5201):** its `inputs` and `outputs` (#5165) said
  `minItems: 1`, a keyword the MCP's schemas do not use (`test/mcp-args.test.js` failed on main); an empty list is
  refused by the tool itself, as the editor's boxes refuse it ("1 to 16 inputs", "At least 1 output"), nothing written.

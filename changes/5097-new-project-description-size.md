In detail:

- **The MCP server's `new_project` within the tools' size limits again (#5097, after #5041):** its description and its
  `kind` argument's say the three kinds in fewer words (the dialog's names; each kind's short words in
  `core/project-kind.js`), under 700 and 250 characters (`test/mcp-tools-size.test.js`, #4752).

In detail:

- **The MCP tools' descriptions checked by every pull request (#5096):** `test/mcp-tools-size.test.js` (#4752) is one of
  the related tests' repository-wide checks (`REPO_WIDE` of `scripts/related-tests.mjs`): it imports `server/mcp.js`
  only, so a change to one tool's module (`server/mcp-board.js`, `server/mcp-projects.js`) did not select it, and two
  pull requests merged green with a description over its limit (#5089).

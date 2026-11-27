In detail:

- **Pull requests' tests: more repository-wide checks, an MCP tool's tests, 12 parts at once (#5951):** every pull
  request runs the fast checks of the whole repository it could break with a file none of them imports (the
  translations of the interface's template literals, its hex colours, the pins the files declare, the documentation's
  pictures and the user's guide site, the workflows' hardening and permissions: 0.2 to 0.3 s each, with those already
  there); a change to an MCP tool's module (`server/mcp-new-source.js`) runs the MCP tests that call one of its tools by
  name (`call('new_source', …)`), which reach it through `server/mcp.js`; up to 12 parts of a pull request's tests run
  at once (6 before).

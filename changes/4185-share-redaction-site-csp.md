In detail:

- **What a shared project's followers get of the owner's runs (#4185):** the console lines, the reports and the Design
  Summary, from the page and from the MCP's `run_process`, have the owner's computer's names replaced by one list the
  server makes (`server/owner-secrets.js`, GET /api/toolchain's `redact`): the workspace and the exchange folder (as
  given and as the system resolves them) as `<workspace>` and `<exchange folder>`, Silinx's configuration folder, the
  home folder as `~`, the ISE host and an absolute build folder there; the Design Summary is redacted too.
- **The single file's Content-Security-Policy (#4185):** the assets' site by its folder (`https://pmnmalo.github.io/Silinx/`,
  the development site under it), never the origin every GitHub Pages site of the account shares (`server/csp.js`
  `siteSource`).

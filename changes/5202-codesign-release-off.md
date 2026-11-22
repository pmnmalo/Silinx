In detail:

- Co-design is off in a release until it is stable: one switch (`core/build-channel.js` `CODESIGN_IN_RELEASE`), the
  build's channel told apart as the single-file edition does (server/build-commit.js: a commit tagged v<VERSION>, or no
  git, is a release), the local server and the MCP server too, and the server's page told by `/build-channel.js`. In a
  release New Project's Co-design card is disabled with its reason, the `uart-avr` example is not offered, the Design
  pane shows no System row, a `.sys.json` opened says so in the console, and the MCP server refuses `new_project` kind
  codesign, `edit_system`, `check_system` and `simulate` of a System with the same message; the development build, a
  checkout's server and the tests keep it. docs/CODESIGN.md says how to turn it on (#5202).

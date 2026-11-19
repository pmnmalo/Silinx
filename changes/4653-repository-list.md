In short:

- **Open from GitHub Repository… lists your repositories:** the most recently pushed first, filtered as you type; a
  click (or the arrow keys) picks one. Any address can still be typed.

In detail:

- **The user's repositories in Open from GitHub Repository… (#4653):** those the account owns, collaborates on or has
  through an organization (a GitHub Classroom assignment's), from GitHub's API: in the browser edition with its sign-in,
  on a server with its token (GH_TOKEN), and on the local server with the system's git through GitHub's command line
  (`gh api`, with gh's own sign-in: no token passes through Silinx). When they cannot be listed (gh not installed or not
  signed in, the browser not signed in), the console says why and how to have them, and the address is typed as before.
  `core/github-repos.js` reads and filters them; the MCP server's new `git_repositories` tool lists them the same way.
- **`test/mcp.test.js`'s list of the destructive tools has `git_clone` (#4654):** #4618 made it destructive.

In short:

- **A Collaboration tab:** the side panel's row of tabs has a Collaboration tab, in both interfaces, with the git
  commands of a project in a GitHub repository: its repository and branch, its changed files (a click compares one
  with the last commit), Commit…, Push, Pull, History…, the GitHub sign-in and the last push's checks; Initialize
  Repository… and Open from Repository… for a project with none; and live sharing (Share Live…, who is in, the links,
  Stop Sharing, Follow, Stop Following). The menus keep their commands. The ISE style's side panel is a little wider
  (330 px) so its six tabs show their names.

In detail:

- **The Collaboration tab (#4215):** a page of the side panel after Teaching (`web/js/collab-tab.js`), in the Silinx
  and the ISE style interfaces: Repository (the GitHub repository, linked, the branch, the commits to push or to pull,
  Commit…, Push to GitHub (not in the browser edition, whose commit is pushed), Pull from GitHub, History…), Changes
  (each changed, new, deleted or conflicting file with the Design pane's mark; a click opens Compare) and GitHub (the
  sign-in's state with Sign in with GitHub… / Sign out of GitHub in the browser edition, GitHub Checks and its last
  result: passed, failed, running or none, the details in the console) and Live Sharing (#3181: the toolbar presence's
  label, who is in with their role, and its menu's commands, `presence()` of `web/js/collab-presence.js`; not shared:
  Share Live…, Share Project's window with Live chosen, disabled where it cannot be, its reason its tip). The same items
  and functions as the Git submenu's and the presence menu's, which stay, as do the Start page's and the File menu's. A
  followed project shows the read-only notice and its Live Sharing box; with git turned off (`SILINX_GIT=off`) the tab
  has its Live Sharing box only, and no tab where nothing is shared live either. The ISE style's side panel is 330 px
  wide by default (300 before) and its tabs more compact, so the six show their names; in a narrower panel the long
  names are ellipsized. Portuguese labels; UI tests in both interfaces and both editions (a follower's tab too), on a
  narrow screen.
- **The git status's remote (#4215):** a project's status (the server's git and GitHub's API) gives its GitHub
  repository (`remote`, owner/repository, null with none), and the MCP's `git_status` says it ("(GitHub: owner/repo)"
  or "(no GitHub repository)").

In short:

- **The Start page's GitHub group:** Initialize Repository…, Open from Repository… and Sign in with GitHub… no longer
  go missing for good when the server did not answer Silinx's first question about git.

In detail:

- **Git's presence asked again after a failed request (#3968):** a failed `GET /api/git` (no token yet, the server not
  answering yet) was kept as "no git" until the page was reloaded, and the Start page's git group, the File menu's
  Open from Repository… and Git submenu, and the Design pane's git entries stayed away; it is now no answer: asked
  again a few times at start-up, each time the Start page is drawn (with its projects) and when a project opens.
  `SILINX_GIT=off` still has no group.

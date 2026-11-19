In short:

- **Changes… in the Collaboration tab:** the changed files open in a window of their own, before History…, the files in
  conflict first; the tab is shorter: one Git Repository box (the sign-in first, GitHub Checks in it), no Changes box.

In detail:

- **Changes…, a window of the changes, instead of the Collaboration tab's Changes box (#4581):** a command before
  History… (the tab, with how many files changed, and the Git menus) opens a window listing the files changed since the
  last commit with the Design pane's marks and their states, the files in conflict first and in red; a click compares a
  file with the last commit, and the window follows git's status while it is open. The tab's Changes box and its folding
  (#4571) are gone; its Repository box says how many files are in conflict. The MCP's git_status lists the files in the
  same order, the conflicts first and counted.
- **The Collaboration tab's Git Repository box (#4581):** the Repository box is now Git Repository, and the GitHub box's
  sign-in (its first line: Sign in with GitHub… or Sign out of GitHub in the browser edition, how git signs in on a
  server) and GitHub Checks with the last push's result moved into it; the GitHub box is gone.

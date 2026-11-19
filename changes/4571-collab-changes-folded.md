In short:

- **The Collaboration tab's changes folded:** a long list of changed files shows its first ten, conflicts first, and
  "N more…" unfolds the rest ("Show fewer" folds it again).

In detail:

- **A long list of changes folded in the Collaboration tab (#4571):** past twelve files, the Changes box shows its first
  ten (the files in conflict first, never folded) and an "N more…" row that unfolds the rest, "Show fewer" folding it
  again; the choice is kept while the page is drawn again (core/list-fold.js). The MCP's git_status still lists them all.

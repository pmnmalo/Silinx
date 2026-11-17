In detail:

- **The merge view of text files (#4214):** `web/js/merge-view.js`, a document of its own for text files changed on
  both sides: each file's hunks side by side (the common ancestor, mine, theirs, a conflict marked), the result below
  them, and for each conflict Mine, Theirs, Both (mine's lines, then theirs') or its lines edited by hand; its toolbar
  holds the file, Previous / Next Conflict, the caller's action and Cancel, its status line the counts, its messages
  go to the console (an action with conflicts left is refused and the first one brought into view). It writes
  nothing: `openMergeView({ files, labels, action })` gives its caller the choices per hunk (or null), which the
  caller's merge applies, so that no conflict marker ever reaches a project's files. In Portuguese too.

In detail:

- **A text file's three-way merge by lines (#4214, phase 3 of #4204):** `core/text-merge.js`, a diff3 on
  `core/text-diff.js`'s diff, the same in the server and the browser: a hunk changed on one side only taken from
  that side, one changed alike on both taken once, hunks that overlap or touch a conflict (resolved by Mine, Theirs,
  Both or a text of the user's; never conflict markers), with no ancestor every difference a conflict; the lines
  compared without their CR, the line end and the final newline merged as the file's properties; a renamed file
  found by its lines (git's 50 % score). Checked against `git merge-file` and on every HDL file of the repository's
  designs merged with itself.

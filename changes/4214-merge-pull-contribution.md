In short:

- **Merging text files:** Pull from GitHub and Merge Contribution… merge an HDL file, a test bench or constraints
  changed on both sides by its lines: changes apart at once; when the same lines changed, the merge view shows the
  common ancestor, yours and theirs side by side and lets you take Mine, Theirs, Both or write the lines, per conflict.
  A pull no longer stops on such a conflict, and no conflict marker is ever written into a project's files. A file
  renamed on one side and changed on the other is merged as a rename.

In detail:

- **Pull and Merge Contribution… merge text files by their lines (#4214, phase 3 of #4204):** the server's git
  (`server/git-merge.js`: the conflicting files' three versions from git's index, merged by `core/text-merge.js`, never
  git's markers) and GitHub's REST API (`core/git-rest.js`, `core/git-rest-merge.js`) give a pull's text conflicts per
  hunk (the error's `texts`, `resolvable`), and Pull opens the merge view, then pulls again with the choices
  (`resolve: { path: { h1: 'mine' | 'theirs' | 'both' | { text } } }`, checked by `checkChoices`); a file removed on
  one side and changed on the other still pulls nothing. Merge Contribution… (`core/project-merge.js`) merges a text
  file both changed by its lines (`merged`), its conflicts per hunk (Merge Lines… opens the merge view) or the whole
  file; with no ancestor each hunk that differs is a conflict. A renamed file (on GitHub or here, in the contribution or
  the project) is found by its lines and its other side's changes merged into it (`renamed`). The MCP's `git_pull` and
  `merge_contribution` take a resolution per hunk, and their results and `merge_preview` name each hunk with its line
  and both sides' lines.

In detail:

- **Open Project's damaged project: its UI test reads the console (#5126):** since #4747 a command's failure is an
  ERROR line of the console, not a modal box, and `test/ui/open-project-damaged.test.js` (#4755) still waited for the
  box. It now waits for Open Project's one ERROR line (the project is damaged, why, what to do), with the dialog closed.

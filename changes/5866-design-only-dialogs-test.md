In detail:

- **A UI test brought up to date (#5866):** `test/ui/design-only-dialogs.test.js` expected New Project's note of the
  top a project started with, which #5786 removed with the Top-Level Source Type; it now checks that a Digital Logic
  project's settings page shows its one hint, with no note of a top or an HDL module.

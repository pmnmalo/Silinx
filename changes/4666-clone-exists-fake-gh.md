In detail:

- **`test/ui/git-clone-exists.test.js` with GitHub's command line faked (#4666):** since Open from GitHub Repository…
  lists the user's repositories (#4653), the UI tests' server has no `gh` unless a test gives it the stand-in
  (`test/fake-gh.mjs`), so the dialog's console said "Your repositories are not listed…" and the test's exact lines
  failed, on CI and locally. The test now gives the server the stand-in with no repository: the list says nothing in the
  console, whatever `gh` the machine has.

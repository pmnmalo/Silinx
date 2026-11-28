In detail:

- **Main's tests read silinx.json's profile, not its old kind (Fixes #5989):** after silinx.json version 2 (#5907), six
  test files outside its pull request's related set still read the project's old `kind` or expected no `profile`
  (`test/server-example-files.test.js`, `test/ui/design-only.test.js`, `test/ui/mode-change.test.js`,
  `test/ui/project-kind-step.test.js`, `test/ui/design-properties-kind.test.js`, `test/ui/system-new-project.test.js`);
  they now read the profile, an example's description compared through its migration. No behaviour changed.

In short:

- **GitHub Checks with a fine-grained token:** GitHub Checks no longer fails with "Resource not accessible by personal
  access token": with a fine-grained personal access token (which GitHub never lets read its Checks) it shows each
  workflow job's result and the commit's statuses, and says which token permissions to add when it cannot.

In detail:

- **GitHub Checks with a fine-grained personal access token (#4237):** GitHub gives fine-grained tokens no Checks
  permission, so its Checks API refused them. When it refuses the token (a 403 that is not a rate limit),
  `core/github-checks.js` reads the commit's workflow runs and their jobs (Actions: read) and its statuses (Commit
  statuses: read) instead, in the same shape for the Collaboration tab, Git ▸ GitHub Checks and the MCP's `git_checks`,
  in both editions; the console says so first (the tests' verdicts, GitHub's annotations, stay unreadable), a
  permission refused as a warning, and both refused an error naming the two permissions to add. The token sign-in's
  steps list the two permissions. Regression tests against the fake GitHub (now with workflow runs, jobs, statuses and a
  fine-grained token's refusals): unit, MCP (`git_checks`, both back ends) and the Collaboration tab in both
  interfaces.

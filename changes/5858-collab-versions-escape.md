In detail:

- **The versions' UI test escapes its console line in full (#5858, #5859):** `test/ui/collab-versions.test.js` escapes
  every regular expression character of the line it waits for, not only `.`, `(` and `)`; CodeQL's two
  incomplete-sanitization alerts on it close.

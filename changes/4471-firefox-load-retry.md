In detail:

- **A UI test run once more when Firefox failed to load a module from the local server (#4471):** the retry of WebKit's
  failed loads (#4428, #4464) takes Firefox's "error loading dynamically imported module" too (`loadFailure` in
  `test/ui/harness.js`, per browser; never Chrome's).

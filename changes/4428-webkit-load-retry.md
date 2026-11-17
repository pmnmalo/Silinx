In detail:

- **A UI test run once more when WebKit failed to load from the local server (#4428):** a test whose only page errors
  are WebKit's refused fetch ("due to access control checks") and failed module import from the test's own server runs
  once more in a fresh page, as one whose page crashed (`webkitLoadFailure` in `test/ui/harness.js`); a second time
  fails it, and any other error fails it at once.

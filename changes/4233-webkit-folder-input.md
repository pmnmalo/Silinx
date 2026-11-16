In detail:

- **UI tests: a project's folder given again after a try that timed out (#4233):** the tests that import a
  project from its folder give it through `setFolder` (`test/ui/zip-helpers.js`): in Firefox and WebKit in tries
  of 15 s, the input emptied after one that timed out (three tries), since WebKit's folder listing now and then
  never sends the input's event that Playwright waits for (the browser edition's Silinx project imported from its
  folder, flaky in WebKit).

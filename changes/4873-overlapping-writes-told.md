In short:

- **Two tabs saving at once on a slow machine:** each tab now shows what ended up on disk; the tab whose save came
  first no longer keeps a text that was written over.

In detail:

- **Two pages' writes overlapping, told to both (#4873):** a page's request on the project waits at most 2 s for another
  page's to end (`server/project-watch.js` `acquire`, #3972), then holds the project anyway. What the two overlapping
  requests changed was told to neither page, so the page whose write came first kept a text no longer on disk. Their
  changes can't be told apart, so they are now told to both pages: each reads the disk, and a page whose editor already
  shows it reloads nothing. Holds of no page (a run, the MCP server) are still told to no page.

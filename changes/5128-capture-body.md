In short:

- **Analyze Design Using the Logic Analyzer works again with the Silinx server:** the capture on the board was
  refused with "unknown spec, probes, top, clock" and its window never opened.

In detail:

- **The page's capture sends the server its own options only (#5128):** since #4753 `POST /projects/:p/capture`
  refuses a field it does not know, and the page's capture (`web/js/capture-ui.js`) gave the server the browser
  edition's fields too (the core's spec, its probes, the top, the clock: `web/js/api-local.js` reads the board with
  them). `web/js/api.js`'s `captureBody` keeps the server's options (`arm`, `timeoutS`, `device`). The UI test of the
  logic analyzer's settings waits for the Save's line before reading silinx.json (its wait never waited).

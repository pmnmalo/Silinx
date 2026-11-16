In short:

- **The Design Summary no longer jumps in front:** on a busy computer, Implement's Design Summary could open late,
  over the document opened meanwhile (the UCF), or take the viewer back to Implement from a simulation just started.

In detail:

- **The Design Summary opened late stays behind (#4021):** Implement brought forward opens its Design Summary once
  `summary.js` is loaded, which may take a while; by then the viewer may have opened another document (it stays in
  front, the summary opened behind it) or gone to another task (the summary is not opened: Implement opens it when it
  comes forward again). Two UI tests hold `summary.js` back (CDP's Fetch) to show it; the UI test "#1409 Tasks (dark)"
  timed out on CI this way, its simulation hidden behind the summary.

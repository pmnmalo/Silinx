In detail:

- **The Tasks side panel's UI test waits for the project to be restored (#5147):** after its reload,
  `test/ui/tasks-side-resize.test.js` clicked Simulate as soon as Implement was in front, while the project's documents
  and its task were still being restored; the restored task then took Implement back (the Design Summary in front), and
  the test timed out waiting for Simulate (the release CI of v15.30.0; every time with `SILINX_UI_THROTTLE=6`). It now
  waits until the project is open and restored.

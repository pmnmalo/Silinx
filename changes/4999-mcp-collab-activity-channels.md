In detail:

- **follow_project's activity test waits for every channel's new value (#4999):** test/mcp-collab.test.js (#4002)
  waited for the owner's view to change, then compared the whole activity; each channel comes in a message of its own,
  the emulator's after the view's, and under load the old emulator's state was still there. The test waits for the
  view, and the layout, the Design pane, the simulation, the emulator and Try it all cleared.

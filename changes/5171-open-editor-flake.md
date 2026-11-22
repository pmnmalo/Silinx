In detail:

- **UI test: "#4017 the browser edition: no Open in VS Code" no longer flaky (#5171):** a new project's Design pane rows
  are drawn while the side panel still shows the Start page, and the Design page comes in front a moment later (10 to
  70 ms); the test right-clicked a row that existed but was not shown yet. Its row menu now waits for the row shown,
  and a regression step hides the pane for a moment before opening the menu.

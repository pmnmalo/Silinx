In short:

- In the browser edition, a Board project of an Arduino, the Explorer 16/32, a Pico or an ESP32 keeps its board when it
  is imported, copied or cloned, instead of becoming a System project (#5883).

In detail:

- **A processor board's Board project imported in the browser (#5883):** `web/js/project-store.js` normalizeProjectJson
  gave every System-profile project with no top `board: null`, a processor board's Board project's too (#5756); it keeps
  that board now (`core/processor-board.js` processorBoardOf).

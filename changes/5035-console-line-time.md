In short:

- Each line of the console, and each entry of its Errors and Warnings tabs, shows the time it was written.

In detail:

- **The time of a console line (#5035):** a muted `14:03:27` before each line of the Console and each entry of the
  Errors and Warnings tabs (`20/11 23:58:01` for one of another day, drawn again at midnight), from its `data-time`
  by the CSS: not part of its text, so the searches, the line's message and the tests read it as before. A message
  carries its `time` (core/message.js `makeMessage`, `entryOf`, `messageData`; `messageTime` its text); a shared
  project's owner's lines carry theirs to its followers' consoles and to the MCP's `follow_project` messages
  (core/collab-runs.js). docs/UI-GUIDELINES.md says so.

In short:

- **Each console message says when it was written:** a muted `14:03:27` before every line of the Console and every
  entry of the Errors and Warnings tabs, with the date too (`20/11 23:58:01`) for a message of another day, so a
  recent message is told from an old one. A shared project's followers see the owner's times.

In detail:

- **The console's time prefix (#5035):** a message has its `time` (`core/message.js`; `consoleTime`: the hour, the day
  and month too of another day, the computer's local time); `log()` stamps each line (`time`: a follower's line, the
  owner's), the Errors / Warnings entries carry theirs (a check's when it was listed), drawn as `data-time` by the
  stylesheet before the line in `--muted` (`web/css/app.css`): not the line's text, so searches, its message and the
  tests' matching are as they were; at midnight the earlier lines show their date. A job's lines keep their times
  (`server/jobs.js` `times`); a shared project's runs carry each line's time (`[text, class, source, time]`), the MCP's
  too; `run_process` returns its run's `startedAt` and `endedAt`, and `follow_project`'s runs show the times.

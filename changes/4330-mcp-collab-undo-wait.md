In detail:

- **A flaky wait in the live sharing's MCP test (#4330):** `test/mcp-collab.test.js`'s #3355 test waited for the
  refused change (a NUL byte) to be undone at the MCP client's with a read that failed on any error; until the
  owner's undo reaches the client, which may come after the browser follower's, `follow_project` reads back the
  client's own change and says it is not shown (binary content), as the interface's follower does. That error,
  and only that one, now counts as "not yet" (any other still fails the test), and the test asserts it right after
  the write, read back in the same call.

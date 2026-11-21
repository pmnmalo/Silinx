In detail:

- **The latency benchmark follows with the owner's key (#5015, #5012, #5022):** `scripts/collab-latency-lib.mjs`'s
  follower and editor join with the owner's key, as #4745's editors list asks (the editor's keystrokes were refused,
  and the benchmark waited for them: `test/collab-latency.test.js` hung its CI part until it was cancelled); a change
  that never arrives now fails after 10 s, the rooms closed.

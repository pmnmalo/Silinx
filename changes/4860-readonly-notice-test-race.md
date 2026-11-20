In detail:

- **A steadier read-only notice test (#4860):** the UI test of a followed project's read-only notice (#3181) waits for the
  notice and measures it in one step, so a toolbar drawn again in between (the follower's view following the owner's) no
  longer fails it.

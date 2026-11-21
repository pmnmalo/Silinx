In detail:

- **The branches' UI test waits longer for Merge Branch…'s conflict (#5003):** 30 s instead of 10 s, since the merge
  fetches the other branch first; it timed out once on a loaded CI runner.

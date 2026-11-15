In detail:

- **The history scan passes on main again (#4167):** `scripts/check-private-data.mjs --history`, which CI runs at a
  release (#555) and without which the release is not published, found the made-up home folders and ISE login of the
  redaction test (`test/collab-runs.test.js`) in the commit that added it, placeholders since: they are allowed in
  that file, as the other values in the history only.

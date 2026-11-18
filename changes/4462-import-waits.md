In detail:

- **The UI tests wait 30 s for an imported project (#4462):** every wait for a project opened by Import (21 of them, the
  pattern of #4438) had the 10 s default, too short on a slow CI runner.

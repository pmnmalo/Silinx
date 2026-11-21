In detail:

- **The collaboration console test leaves the back-up reminder out (#5006):** `web/js/backup-reminder.js` writes the
  application's line about the browser's storage (#4971); its `api.gitRemote` call only chooses its button's label.

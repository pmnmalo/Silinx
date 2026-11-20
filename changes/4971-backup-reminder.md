In short:

- **A back-up reminder:** in the browser edition, a project kept only in the browser's storage and not backed up for
  7 days (exported as a Silinx project, or committed to GitHub) is said once in the console when it opens, with
  **Export Project (.zip)** and **Store Project in a GitHub Repository…** buttons. The MCP's `project_info` says where
  a project is stored and when it was last backed up.

In detail:

- **The projects' last back-ups (#4971):** a Silinx export (Export Project (.zip)…, `export_project` kind silinx)
  or a push to GitHub (the browser edition's Commit and Push, Push to GitHub, `git_push`) recorded outside the project
  (`core/backup.js`; the browser's localStorage, `web/js/backup-record.js`; the configuration folder's `backups.json`,
  `server/backup-store.js`), moved with a rename, removed with a delete; the browser edition's reminder
  (`web/js/backup-reminder.js`) after 7 days from the last back-up or the project's first sight, at most once in a
  session, its buttons the Silinx export and Store Project in a GitHub Repository… (Commit and Push… for a project in
  one); `project_info` reports `stored` and `lastBackup`.

In short:

- File ▸ Open Project… says where each project is kept: the workspace folder or this browser's storage, and the
  GitHub repository it is in.

In detail:

- **Open Project's Stored In (#4314):** the list has a Stored In column, before Last Used: *Workspace Folder* (the
  server's, or the folder the browser edition opened) or *Browser Storage*, and *GitHub: owner/repo* under it for a
  project in a GitHub repository (cloned, or one Initialize Repository… gave a remote); its tip says it in words. The
  server's list of projects (`GET /api/projects`) gives each one's `stored` and `github` (server/project-places.js:
  its origin's, with the system's git; its record's, with GitHub's API; none with git off), the browser edition's its
  storage and its repository; the words are core/project-place.js's. The MCP's `list_projects` says the same
  (`stored`, `github`, and its line's "Kept in the workspace folder…").

In short:

- **A project's settings changed by the MCP server or another tab are no longer overwritten by the page:** a file
  the MCP server added to the project stays when the page, not yet told of it, sets the top or changes a setting.

In detail:

- **The project's description written over the revision the page read (#4726):** `GET /api/projects/:p` sends the
  description's `ETag` (its file's text hashed); the page's `PUT` sends `If-Match`, and one changed meanwhile is
  refused with a 412 that holds the current description. The page then merges its change into it, three ways (a
  field, an object's key, a file by its path, an excluded file by its name; the page's wins where both changed one
  thing: `core/project-desc-merge.js`), writes it again and keeps it as its own. A `PUT` without `If-Match` (the CLI,
  an older page) writes as before; the browser edition is unchanged.

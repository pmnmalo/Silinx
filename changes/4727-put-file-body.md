In detail:

- **`PUT /api/projects/:p/file` refuses a body that is not the file's text (#4727):** a body with no content type,
  `application/octet-stream`, or JSON without a string `text` answered `{ ok: true }` and emptied the file; it is now
  a 400 ("text: the whole text of the file", as the MCP's `write_file`) and the file is kept. An empty text body
  still writes an empty file.

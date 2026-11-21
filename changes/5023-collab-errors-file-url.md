In detail:

- **The stray-rejection test on Windows (#5023):** `test/collab-errors.test.js`'s child process imports the server by a
  `file:` URL, not its absolute path, which Windows's ESM loader refuses (`D:` taken for a URL's scheme, #4759's test).

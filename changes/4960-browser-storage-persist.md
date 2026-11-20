In short:

- **The browser's storage kept:** the browser edition asks the browser to keep its storage persistent, so that it does
  not delete the projects kept in it when the disk runs short; a browser that refuses is said in the console.

In detail:

- **Persistent storage in the browser edition (#4960):** at start-up, with the projects in the browser's storage,
  `navigator.storage.persisted()`, then `persist()` when it is not persistent yet (not waited for: Firefox asks the
  user); a refusal is one line in the console, with the way to keep a copy; a browser without the API is asked nothing,
  and a workspace folder on the disk needs nothing (`web/js/storage-persist.js`).

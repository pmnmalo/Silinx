In short:

- **Browser edition with a workspace folder:** a reload no longer waits about 10 seconds for the browser's permission to the
  folder, and the project that was open comes back where it was once the browser answers.

In detail:

- **The workspace folder's permission not waited for at start-up (#4656):** Chrome may answer a remembered folder's
  `queryPermission` seconds late (10 s measured); the start-up waits 1.5 s at most (`PERMISSION_WAIT`,
  `web/js/api-local.js`), saying "Waiting for the browser's permission to the workspace folder '<folder>'…", and goes on
  with the browser's storage. The late answer, granted, makes the folder the storage again and reopens the project that was
  open, its documents and task where they were (`web/js/storage-late.js`), unless one was opened meanwhile; not granted, it
  says the folder needs the permission again (Start page ▸ Reopen <folder>), as before. Reopen <folder> no longer waits for
  such an answer either.

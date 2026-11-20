In short:

- **A folder on the disk offered at the first run:** in Chrome and Edge, the browser edition's console offers
  **Choose a Workspace Folder…** or **Keep in This Browser** the first time it opens; with a folder chosen, the projects
  already in the browser can be copied or moved into it (a move asks before deleting them from the browser).

In detail:

- **The browser edition offers a workspace folder at its first run (#4962):** where the browser can give one (the File
  System Access API), with no folder set nor remembered, one console line with two buttons (a console line's actions,
  several now: all disabled once one runs); the answer remembered, the picker cancelled none (offered again); a folder
  chosen with projects in the browser's storage: Copy, or Move… (the ones copied deleted from the browser's storage
  once confirmed); Firefox and Safari offered nothing (`web/js/storage-offer.js`, `web/js/storage-choice.js`).

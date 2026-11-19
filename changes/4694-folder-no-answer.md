In short:

- **Browser edition with a workspace folder:** when the browser gives no answer about the folder at start-up, the console
  says so after 10 seconds, and how to fix it: quit the browser completely (Cmd+Q on a Mac) and open it again.

In detail:

- **The browser's silence about the workspace folder said (#4694):** Chrome, stuck on a remembered folder, answered nothing
  about it (`queryPermission`, even `isSameEntry`) until it was restarted, and the project kept there did not reopen, with
  no word why. After 10 s with no answer (`web/js/storage-late.js`, `web/js/silent-answer.js`) the console warns once: "The
  browser has not answered about the workspace folder '<folder>' for 10 s: quit it completely (Cmd+Q on a Mac, ⋮ ▸ Exit on
  Windows and Linux; closing its window is not enough) and open it again." (in Portuguese too); the wait goes on, and a
  late answer still reopens the project where it was (#4656). A UI test checks that a reload reopens the project where it
  was at once, with the site out of reach and nothing of the toolchain kept.

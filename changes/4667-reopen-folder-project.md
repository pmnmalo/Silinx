In short:

- **Browser edition with a workspace folder:** after a refresh that asks for the folder's permission again, the click
  on Reopen <folder> also reopens the project that was open, with its documents and the one in front.

In detail:

- **Reopen <folder> reopens the project the start-up left closed (#4667):** after a refresh, Chrome often answers a
  remembered folder's permission with "prompt", so the app starts on the browser's storage with no project. Reopen
  <folder> (the Start page, the File menu) used to switch the storage only. Now it also reopens this tab's project where
  it was, unless another project was opened meanwhile (`web/js/storage-late.js` `reopenWaiting`, as the late grant of
  #4656 does).

In short:

- **The Collaboration tab's Sharing box:** the Live Sharing box is now **Sharing**, with **Share a Copy…** in it:
  Share Project…'s window with A copy chosen (a link with the project in it, or its short link), beside Share Live…
  and the live sharing's commands.

In detail:

- **Share a Copy… in the Collaboration tab (#4259):** `web/js/collab-tab.js`'s Live Sharing box is named Sharing
  (Partilha: its own word, since the toolbar's presence says "Sharing", A partilhar) and has Share a Copy…, disabled
  with no project as File ▸ Share Project… is (one check, `web/js/share-how.js` `canShare()`, for the menu, the
  toolbar's button and the tab), before Share Live… or the live sharing's commands; it opens Share Project…'s window
  with A copy chosen and kept as the viewer's way (`shareCopyDialog()`, as Share Live…'s). The MCP's `project_link` already makes the copy's link. Tests: `test/ui/collab-tab.test.js`,
  `test/ui/collab-tab-browser.test.js` and `test/ui/git-off.test.js` (the box's name and entries, Share a Copy…
  opening the window with A copy chosen, in Portuguese, in both interfaces, no warnings).

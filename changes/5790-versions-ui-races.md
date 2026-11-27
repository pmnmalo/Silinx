In detail:

- **The owner's reopened text editor no longer overwrites an editor's change (#5792):** in a project shared live, the
  owner's text editor, once bound to its file's shared text, put its own text into it even with no unsaved change of
  the owner's: a file reopened (by the owner's Undo of a command, which reads its documents again from the disk) could
  so take back an editor's line that had not reached the disk yet. The owner's text is now put only when its document
  holds changes not saved, as a drawing's is (`web/js/collab-bind.js`).
- **The versions' UI tests wait on state (#5790):** the Versions… dialog marks a version's file list `data-loading`
  while it is read (its list moved the dialog's buttons under a click); an editor's live binding is a state of its
  document (`liveBound`) the tests wait for instead of a timer; the tests open an editor's file at the owner's page (an
  editor's page follows the owner's front document while it settles) and wait for the disk with a failing wait.
  Stressed with `SILINX_UI_THROTTLE=6`, two processes at once. Tests: versions, collab-versions, collab-undo (both
  interfaces).

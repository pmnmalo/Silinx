In short:

- **The browser edition with two tabs open keeps both tabs' work:** each project is kept apart in the browser's
  storage, so a second tab no longer erases the projects and changes of the first; a damaged entry is reported, never
  written over.

In detail:

- **The browser's storage: one entry per project, nothing cached per tab (#4725):** every project was in one
  localStorage entry that each tab cached and wrote whole, so a tab opened earlier wrote back its stale copy over the
  other tab's new projects and edits, and a read that failed was taken as "no projects" and the next save wiped them.
  Each project now has its own entry (`silinx.standalone.project:<name>`), read again before each change and written
  whole; an entry that cannot be read is an error (not listed, its name kept, never written over); a write that fails
  changes nothing. The entry of earlier versions is moved out project by project, each written before it leaves the
  old entry; one that does not fit stays there and is read as before.
- **The browser's snapshots within one budget, following their project (#4725):** the snapshots of the copies given
  out (#4205) are kept within 1 M UTF-16 units for every project together (2 MB per project before), so that they
  never take the projects' room; they move with a renamed project and go with a deleted one.

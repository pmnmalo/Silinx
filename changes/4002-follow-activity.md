In short:

- **Following what the owner does:** a viewer of a shared project now follows more than the files. It sees the
  documents the owner has open and the one in front (a simulation is run again on the viewer's page, from the same
  files), the Design view or the task, and the row selected and expanded in the Design pane. Clicking there yourself is
  browsing alone; *Follow <owner>* follows them again.

In detail:

- **The owner's activity (part 1 of #4002):** a new sealed message of the room's protocol, `KIND.activity`
  (core/collab-activity.js), carries what the owner does, by channel. The owner keeps each channel's latest value, sends
  it when it changes, and sends it again to a follower that joins or rejoins. A value is at most 1 MB and there are at
  most 16 channels. The room forwards no follower's or editor's activity (read only), and a page reads only the
  owner's.
- **Its first two channels (#4002, core/collab-channels.js):** `ui` is where the owner is (the open documents, the one
  in front, the split, the left pane's page, the Design view and the task, as a design link's view, checked as one);
  `design` is the Design pane's selection and its rows expanded or collapsed.
- **A viewer follows them (#4002, web/js/collab-activity.js):** its page opens the owner's documents, and closes the ones
  the owner closes among those it opened. It brings the same one to the front, shows the same view, page and task, and
  selects and expands the same rows. The viewer's own click on the Design pane, its pages, its views or the tasks stops
  following, as bringing another document to the front already did; the console now says "Browsing alone: <owner> is
  no longer followed".
- **MCP (#4002):** `follow_project` gives the owner's activity (`ownerActivity`, and its lines in the text).

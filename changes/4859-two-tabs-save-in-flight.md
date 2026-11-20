In short:

- **Two tabs saving a file at once:** the tab whose save is still on its way no longer asks which version to keep.

In detail:

- **Two tabs saving a file at once: no File Changed on Disk (#4859):** when the server told a tab of the other tab's write
  while its own save was still on its way, the tab read the disk before its write landed and asked which version to
  keep. It now waits for its own save, reads the disk again and finds its own text; the other tab is told of it and
  reloads. The two-tabs UI test also waits until each tab has been told of the other's write before checking that
  nothing more is told.

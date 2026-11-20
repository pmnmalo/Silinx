In detail:

- **Merge Contribution and Undo Merge transactional (#4757):** a merge that stops halfway (a file that cannot be
  written, a crash) no longer loses the project as it was before it: doing the merge again used to write the
  half-merged project over that backup, and Undo Merge was then refused for good. Another merge is now refused until
  Undo Merge puts the project back. An undo that stops halfway is done again until it ends, file by file, where it
  used to be refused ("changed since the merge"). On the local server a merge and its undo hold the project's lock
  from the first write to the last (another tab's, the MCP server's or another process's write waits for them; the
  project's lock may be taken again by what runs under it, #4757), and a binary file of the project (an image, not
  UTF-8 text) is left out of the merge, as a contribution's binary files are: it is never written back decoded as
  text.

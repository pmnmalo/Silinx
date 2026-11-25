In detail:

- **The UI test of a System node's folder renamed and removed waits for its last Check System (#5591):** it read the
  console as soon as the folder's deletion was said, and the last save's warning ("fpga joins nothing") could come
  after it (test/ui/system-node-folders.test.js: the fourth warning waited for, the exact list then asserted).

In detail:

- **The messages test knows the System's Program All and Program Node (#5584):** `test/messages.test.js` lists every
  module that writes a process's header. `web/js/system-program-ui.js`, from #5489's part 3, was missing from that list.
  Its runs give their own source, Implement's, as a System node's implementation does. Fixes #5584.

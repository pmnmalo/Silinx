In short:

- **Live sharing: an editor's quick edits all reach the owner's disk:** the file on the disk always ends as the shared
  text, never an earlier one.

In detail:

- **An editor's changes written to the owner's disk in their order (#4110):** each change an editor made to a text file
  was written by a write of its own, with nothing ordering them; a replacement (a deletion, an insertion) or fast typing
  could leave the file on an earlier text when an earlier write finished last, until the next change (a rare failure
  of test/mcp-collab.test.js's promote / demote). core/collab-doc.js watchDoc takes `inOrder`: each call once the one
  before has ended, each file's text as the shared document has it then; the interface's owner page
  (web/js/collab-share.js) and the MCP's share_project (server/mcp-collab.js) use it.

In detail:

- **Two live-collaboration tests that timed out now and then (#4210):** `test/ui/collab-sim.test.js` "#4002" compared
  the viewer's simulation with the owner's as the owner's page showed it at one moment, after a run or a restart:
  the owner's Objects values are drawn at its next frame, so on a loaded runner that snapshot could be one it never
  settles on; both are now read again at each look. `test/mcp-collab.test.js` "#3355" wrote the MCP client's second
  change once a page saw the owner undo the refused one, not once the MCP client itself had: written over its copy
  with the NUL byte's line still in it, it merged as `by Bot…` (no `-- `), never the text the test waited for on the
  disk; it now waits for the MCP client's copy too.

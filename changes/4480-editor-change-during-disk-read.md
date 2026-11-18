In detail:

- **Live sharing: an editor's change no longer lost to the owner's reading its disk again (#4480):** when the owner's
  disk changed (its own writes of an editor's previous change, seen by the project's watcher), the owner's page and
  `share_project` read the project again and published it into the shared document; an editor's change that arrived
  during that read was put back by it before it was written, and so never written (a source removed, renamed or
  deleted stayed as it was). The read is now published only if no change arrived meanwhile, and the project is
  published again after that change (`core/collab-files.js` `editQueue`'s `publish(fresh)`). It made the #4418 test of
  `test/mcp-collab.test.js` time out on a loaded runner.

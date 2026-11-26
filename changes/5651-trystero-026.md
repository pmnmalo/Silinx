In detail:

- **Live sharing back on Trystero 0.26 (#5651):** @trystero-p2p/torrent 0.27 (#5137) dropped its `selfId`, so a shared
  project's meeting point had no id of its own and `test/collab-meet.test.js` failed; the dependency is 0.26 again
  (`^0.26.0`, the third-party notices regenerated) until 0.27's identity API is adopted.

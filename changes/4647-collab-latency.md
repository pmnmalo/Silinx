In short:

- **Live sharing: the owner's cursor and selection reach followers at once:** what a follower sees of the owner's
  cursor, selection, documents and views comes about one frame after the owner's key or click, plus the network's
  time. It used to come 140 ms later on average and 300 ms at worst. A follower's cursor appears in the owner's
  editor at once too.

In detail:

- **A shared project's latency, owner to follower, measured; the presence sent at once (#4647):**
  `node scripts/collab-latency.mjs` measures the time from an owner's action to a follower's seeing it: a keystroke,
  a drawing edit, the cursor, an editor's keystroke back, the owner's activity, a large paste and a large file. It
  runs on each path (p2p, Silinx's relay, the Cloudflare relay on the Workers shim), with a round trip of 0, 20 or
  80 ms added. It also times each stage on its own: the Yjs update, sealing, signing, splitting into parts and
  applying. `--webrtc` adds a real data channel in Firefox and WebKit. Content changes already took the network's
  time plus less than 1 ms. The cursor and the activity waited for the page's look every 300 ms, then for a view
  sent at most every 250 ms. Now the pages of the owner and of a follower look at themselves 16 ms after a key, a
  click or a selection (`core/collab-pace.js`), with the 300 ms look kept for what no event reports. The owner's page
  also looks again when the participants change, and a follower's page looks once the project has arrived. The
  owner's view is sent at most every 50 ms, a follower's every 125 ms (under the relay's 10 a second). The cursor's
  median went from 136 to 242 ms to 18 to 100 ms (0 to 80 ms of round trip). The wire is unchanged.

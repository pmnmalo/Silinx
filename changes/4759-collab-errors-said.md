In short:

- Live sharing: a message of the relay that fails no longer stops the share silently; the failure is said in the
  console. The local server no longer ends, with every share it runs, on an unexpected failure.

In detail:

- **Live sharing's errors said, not lost (#4759):** a control message of the relay whose handling fails no longer
  stops every later one (the client's chain went on rejected); the failure is said once in the console, as are a change
  received that cannot be read and one that cannot be sent (`core/collab-client.js`). The owner's write of a drawing
  merged with the others' changes that fails is said as an error (`web/js/collab-share.js`), not dropped. The local
  server says a promise rejected that nothing handled on its console and goes on (`server/server.js`), rather than end
  with it, as Node does by default, and every share with it.
- **A share resumed says nothing of a follower that comes back late (#4759):** after the owner's page reloaded
  (#4850), the owner's own view could change before a follower's presence came back. The follower was then said to
  have left, and to join again once its presence came. Now the followers the share knew are kept, unsaid, for 30
  seconds after the resume (`web/js/collab-share.js`). The UI test of the reload, which the related tests run, failed
  on it under load.

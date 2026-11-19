In detail:

- **A test made steady: the frames to meet a relay's meeting point bounded by what they are (#4660):** the session of
  three in `test/collab-meet-relay.test.js` asserted fewer than 40 frames to meet and connect. The count is the
  signalling, always 24 frames, plus the room's own frames that go through the relay before a follower's data channel
  opens; the timing decides how many (28 to 40 frames measured). The count is now bounded by the signalling plus what
  the opening and the joins take through a relay's room, measured in the same test.

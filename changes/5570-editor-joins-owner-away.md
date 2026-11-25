In short:

- **Sharing with editors:** an editor who opens the editor link while the owner is away (its connection lost, its
  project kept for its return) is let in once the owner is back; before, they could never edit.

In detail:

- **An editor joining while the owner is away asks again to be listed once the owner is back (#5570):** the room
  passes a request to be listed to the owner only while it is connected, and dropped the one made while the owner was
  away, so the editor was never listed and its edits waited forever (core/collab-client.js: a follower told the owner
  is away asks again when the owner's project arrives and the owner's list does not have it). Test: collab-resume (an
  editor joining while the owner is away: listed once the owner is back, its change reaches the owner, no error;
  fails on the old code).

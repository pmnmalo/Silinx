In short:

- **Following a shared project:** a click of yours in the Design pane while the owner selects or expands another row
  is no longer lost: you browse alone from the moment you press the button, and your row is selected.

In detail:

- **A follower's press on what the owner's activity drives is its own action (#5541):** the owner's selection that
  arrived while the follower's button was down on a row drew the Design pane again under it, so the release was on
  another element, no click came, the follower kept following and the row was not selected (CI: #4002's test
  'waiting for browsing alone'). A mouse's or a pen's primary button pressed there is the follower's own action now,
  as its click (web/js/collab-activity.js watchOwnActions; a finger's touch, which may be a scroll, still by its tap).

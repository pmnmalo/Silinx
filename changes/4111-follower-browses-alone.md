In detail:

- **A test's follower browses alone (#4111):** test/ui/readonly-notice.test.js's follower of a shared project clicks
  the Design pane first, as a user's own action, so the owner's activity (#4002: the Design Summary in front) no longer
  brings the summary back over the documents the test opens; it failed now and then on CI and locally (the 30 s wait
  added before was not the cause, removed).

In short:

- **Following the owner's runs:** a viewer following the owner on Implement no longer stops following at the end of
  the owner's run (its page brought its own Design Summary forward, taken for the viewer's choice).

In detail:

- **A follower's page brings no Design Summary forward of its own (#4862):** the end of an implementation while
  Implement is in front brings the Design Summary forward (#802), but not on a follower's page (web/js/tasks.js): its
  marks are the owner's run's, its document in front the owner's; brought forward there, at the follower's next look it
  was taken for the follower's own choice and the follower browsed alone, the owner's run lines no longer shown (a
  slow page saw the run's running mark: the #4002 runs UI test under load).

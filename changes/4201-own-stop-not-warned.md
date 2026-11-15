In detail:

- **One's own Stop Following not warned (#4201):** a follower that stopped following was told, as a WARNING, that the
  connection to the relay had ended (its own close ended the session with a lost connection's reason). Its close now
  ends it as its own (`core/collab-client.js`: the reason "you stopped following", the event marked `stopped`), said in
  the console as an information line; the owner's stop and a connection lost for good still warn.

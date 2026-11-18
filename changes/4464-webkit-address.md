In detail:

- **WebKit's failed load retried as CI's log says it (#4464):** its address came as `http: /127.0.0.1:…`, which
  the retry of #4428 did not take; both forms are taken now.

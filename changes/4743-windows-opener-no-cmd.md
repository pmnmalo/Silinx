In short:

- **Windows: the browser opened even when the user's folder has `&`, `^` or `%` in its name.**

In detail:

- **The launcher's browser on Windows without `cmd /c start` (#4743):** the page that leads to the server's address is
  opened through `rundll32 url.dll,FileProtocolHandler`, given as one argument, so no shell re-reads the characters of
  its path.

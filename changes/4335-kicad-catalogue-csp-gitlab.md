In short:

- **The KiCad catalogue in the browser's edition:** KiCad's 74xx and 4xxx parts are imported, no longer refused with
  "NetworkError".

In detail:

- **The pages' CSP lets the KiCad catalogue fetch from gitlab.com (#4335):** `https://gitlab.com` joins `connect-src`
  (`server/csp.js`, the server's header and the static editions' `<meta>`), as #4312's fetch through GitLab's API
  needs. A test checks that every catalogue file's browser URL is allowed.

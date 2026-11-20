In short:

- **Your Cloudflare relay kept as your GitHub sign-in:** Set Up a Cloudflare Relay… has a Remember the relay in this
  browser box (ticked by default); unticked, the relay is kept in the tab until it closes. A Silinx opened from a file
  keeps it in the tab only.

In detail:

- **The relay's key kept as the GitHub token (#4737):** the browser edition kept its Cloudflare relay (address and
  key) in `localStorage` always, `file:` included, where every page opened from the disk reads it. It now follows the
  GitHub sign-in's policy (#3530): Remember (the default) in `localStorage`, otherwise the tab's `sessionStorage`; at
  `file:` the tab only, and a relay left in `localStorage` there is moved to the tab. SECURITY.md says so.

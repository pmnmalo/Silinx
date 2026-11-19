In short:

- **Set Up a Cloudflare Relay…** in the Collaboration tab: a relay of your own for live sharing in a few steps. Silinx
  makes its key, opens Deploy to Cloudflare, checks the relay once deployed (and says how to let the site in if it
  does not), and remembers it: Share Project… ▸ Live then shares through it.

In detail:

- **The Collaboration tab's Cloudflare Relay box (#4574):** in the browser edition, the relay set (or none) and Set Up
  a Cloudflare Relay…: a key made in the page (WebCrypto, 43 characters) with Show, Copy and New Key, the Deploy to
  Cloudflare button in a new tab, then the relay's address; Check and Save checks it (core/relay-setup.js: its root
  answers "A relay of Silinx's shared projects", it lets the page's site in, its key opens a meeting point, nothing
  kept) and keeps it in this browser's settings. A site it does not let in: the exact `ORIGINS = "…"` line to set.
  Check Cloudflare Relay, Change Cloudflare Relay…, Forget Cloudflare Relay. Every result in the console; the key in no
  link, address or message.
- **Share Project… ▸ Live:** its fields say Cloudflare (Cloudflare relay (optional):, Its key (RELAY_KEY):), filled
  with the relay set, and a Set Up a Cloudflare Relay… link.
- **The Cloudflare relay's Worker:** its root answers any page (CORS) and lists the origins it lets in
  (`Silinx-Origins`); its `.dev.vars.example` says where Silinx makes the key. A relay deployed
  earlier must be deployed again for Silinx's check.
- **The MCP's live_relay (#2674):** status, new_key, set (a Cloudflare Worker's address and its key, checked first,
  kept in config.json's `liveRelay`), check, forget; `share_project` with `relay: true` shares through it (the links on
  the Silinx site, naming the relay), and `follow_project` follows its links.
- **The docs:** the live relay page and the relay's README show the Collaboration tab's way first, the terminal's
  second.

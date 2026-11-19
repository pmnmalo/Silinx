In short:

- **Share Project… Relay:** in the browser, a live share can name a relay of your own (a Cloudflare relay, its
  address and its key, remembered by this browser): your followers then reach you directly when they can, through the
  relay otherwise. The link carries the relay, so followers need nothing else.

In detail:

- **A relay in Share Project… ▸ Live (#4543):** the Relay: field (its address, one of the site's relays offered) and its
  key replace "Through a relay": with a relay, the page hosts the room and its followers meet it at that relay's
  meeting point (#4542); without one, at the public meeting point or with codes, as before. The link names the relay
  (`…host.<owner's key>&relay=<address>`). The Silinx site's Content-Security-Policy lets its pages reach any Cloudflare
  Worker's relay (`https://*.workers.dev`, `wss://*.workers.dev`); a link through another relay is still refused. The
  MCP's follow_project follows such a link through the relay (no WebRTC there); its relay must be one the user's
  settings name (#3363). share_project goes through a Cloudflare relay already, with its key.

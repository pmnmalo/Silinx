In short:

- **An unknown relay marked when you follow a link:** Follow a Shared Project says when the link's relay is neither
  this Silinx's nor your own, and follows through it only once you tick that you know who runs it.

In detail:

- **The follow dialog and a link's relay (#4742):** a link to follow may name a Cloudflare Worker's relay, which sees
  the follower's IP address and name. Follow a Shared Project now marks a relay that is neither one of this Silinx's
  nor the relay of this browser's settings as unknown, with Follow disabled until the follower confirms it (English
  and Portuguese). The MCP's `follow_project` already follows through the user's own relays only. SECURITY.md says so.

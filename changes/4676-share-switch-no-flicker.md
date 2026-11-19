In short:

- **Share Project… no longer flickers** when you switch from Live to A copy.

In detail:

- **Share Project…'s switch drawn with no frame between (#4676):** switching between A copy and Live (either way, the
  Cloudflare relay or peer to peer) closed the window first and opened the other one once it was ready (A copy's
  once its link is made), so for a frame or more there was no window at all. The other way's window now opens first
  and replaces this one in the same frame.
- **Share Project…'s texts the same height on either side of a switch (#4676):** A copy's and Live's introductions,
  and Live's two ways' explanations (peer to peer, the Cloudflare relay), are reworded to about the same length, in
  English and Portuguese, and each is laid out over its twin unseen, so it takes the taller one's lines at any width:
  switching moves nothing below them.
- **Share Project… ▸ Live: your relay on a row of its own (#4676):** "Your relay: … Change…" (or the note that none
  is set up) moved down, out of the relay's explanation, to a row of its own just above "Your name, as they see it",
  shown when the Cloudflare relay is chosen; peer to peer keeps its place unseen, so switching moves nothing below.

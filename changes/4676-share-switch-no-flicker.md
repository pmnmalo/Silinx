In short:

- **Share Project… no longer flickers** when you switch from Live to A copy.

In detail:

- **Share Project…'s switch drawn with no frame between (#4676):** switching between A copy and Live (either way, the
  Cloudflare relay or peer to peer) closed the window first and opened the other one once it was ready (A copy's
  once its link is made), so for a frame or more there was no window at all. The other way's window now opens first
  and replaces this one in the same frame.

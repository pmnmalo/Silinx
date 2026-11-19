# A relay of your own for live sharing

[User's guide](README.md) · English · [Português](../pt/live-relay.md)

When you share a project live from the Silinx site, your page hosts it. Your followers connect to your page
**directly** (peer to peer, WebRTC) when their network lets them. Before that, they have to find your page. They can do
it in three ways:

- **a relay of your own**, which also carries the messages of a follower whose direct path does not connect (a network
  that lets no UDP through, as many school and company networks do);
- the public meeting point (WebTorrent trackers run by others), when you give no relay;
- a code exchanged by hand (*Add a User…*), as the last resort.

A relay of your own on Cloudflare's free plan takes a few minutes to set up and needs no server. Everyone sets up their
own: a teacher for their classes, a student for their group. What it costs against the free plan counts on the
account that set it up.

## Setting it up, once

1. Open the [relay's page](../../../packages/silinx-relay-cloudflare/README.md) and click **Deploy to Cloudflare**.
2. Sign in to Cloudflare, or create a free account. Let it copy the relay into your GitHub account.
3. When it asks for `RELAY_KEY`, give a long random key (24 characters at least) and keep it somewhere safe, as you would
   a password.
4. At the end it shows the relay's address, `https://silinx-relay.<your name>.workers.dev`. Open it: it answers
   "A relay of Silinx's shared projects".

Silinx never needs your Cloudflare account nor a token of its API: only the relay's address and its key.

## Sharing through it

In *Share Project…* ▸ *Live*, fill in **Relay** (the address) and **Its key**, then *Start Sharing*. This browser
remembers them. The link names the relay, so your followers need nothing but the link: no key, no account.

The relay sees no file. Everything is encrypted with the key in the link, and the relay never has that key. It sees only
how many messages pass and when.

If you clear the browser's data, the relay and its key are forgotten: give them again. The relay itself stays where it
is. You find its address in Cloudflare's dashboard (*Workers & Pages*). If you lose the key, set a new one there
(*Settings* ▸ *Variables and Secrets*) or with `npx wrangler secret put RELAY_KEY`; the old one stops working.

## What the free plan gives

Cloudflare's free plan counts per account and per day (see Cloudflare's pricing page for the current figures):

- **100,000 requests a day**: each message the relay receives counts (WebSocket messages are billed at a fraction of a
  request: see the pricing page).
- **13,000 GB-s of duration a day**: the time a room or a meeting point is awake. One that is quiet goes to sleep and
  costs nothing until a message comes.

Peer to peer, the relay carries the signalling only. In a test of three people (20 edits, 60 cursor moves), it passed 30
messages to connect them and none after. Through the relay, the same session took 240. So most of a class connects at
almost no cost. Only the followers whose network blocks direct paths use the relay for every message: they are what
counts.

When a limit is reached, the relay refuses until the next day. Your followers then use the public meeting point or a
code, and those whose direct path fails cannot follow.

## A Silinx server's relay

A Silinx server (`silinx serve`) has a relay of its own, which its pages use. Another server's relay can be named in
`config.json` (`relay.relays`, with `relay.key` on that server). The MCP server's share_project and follow_project go
through the relays the user's settings name, a Cloudflare relay too.

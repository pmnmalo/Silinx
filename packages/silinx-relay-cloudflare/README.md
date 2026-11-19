# A Silinx relay on Cloudflare

A relay of Silinx's shared projects (live sharing) that runs on Cloudflare Workers with one Durable Object per room,
on Cloudflare's free plan. Anyone can deploy one with their own Cloudflare account and share projects through it from
the Silinx site, with no Silinx server. A teacher can deploy one, and so can a student: everything that is counted
against the free plan's limits counts on the account that deployed the relay.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/pmnmalo/Silinx/tree/main/packages/silinx-relay-cloudflare)

## What it does

It runs the same room logic as a Silinx server's relay (`core/collab-room.js`, copied as it is into `src/core/` by
`node scripts/sync-relay-cloudflare.mjs`; a test checks that the copies match). Each room has the same roles, limits
and checks: only the owner's changes and an editor's signed edits are passed on, a follower's awareness speaks for that
follower only, and so on. The relay reads nothing of a project. Its frames are encrypted with the key in the link's
fragment, which never reaches it.

- **Opening a room needs the relay's key**, a secret of the Worker (`RELAY_KEY`, 24 characters at least). Whoever
  shares a project through the relay gives it in Silinx (Share Project… ▸ Live). Followers need only the link.
- **Pages from other sites are refused**: a page's WebSocket is let in only when its origin is in `ORIGINS`
  (`wrangler.toml`; the Silinx site, `https://pmnmalo.github.io`, by default). A program's WebSocket, such as the MCP
  server's, has no origin and is let in.
- **Its meeting points** (`/api/collab/meet/…`): a project hosted by its owner's page meets its followers there; they
  go peer to peer (WebRTC) when a direct path works, and through the relay otherwise. Its key opens a meeting point too.
- **A quiet room sleeps** (the WebSocket Hibernation API): Cloudflare keeps its connections open and it costs no
  duration until a message comes.

## Deploying it

1. Click **Deploy to Cloudflare** above, sign in to (or create) a Cloudflare account, and let it make a copy of this
   folder in your GitHub account. When it asks for `RELAY_KEY`, give a long random key (24 characters at least) and keep
   it somewhere safe.
2. Its address is shown at the end, `https://silinx-relay.<your subdomain>.workers.dev`. Open it: it answers
   "A relay of Silinx's shared projects".
3. In Silinx, Share Project… ▸ Live ▸ Relay: give its address and the key.

From a terminal instead: `npx wrangler deploy` in this folder, then `npx wrangler secret put RELAY_KEY`.

## The free plan's limits

Cloudflare's free plan counts per account and per day (see Cloudflare's Durable Objects pricing page for the current
figures): 100,000 requests, which include the WebSocket messages a relay receives, and 13,000 GB-s of Durable Objects'
duration, that is the time a room is awake in its 128 MB. A room whose participants are active stays awake. Once a
limit is reached, the relay refuses until the next day.

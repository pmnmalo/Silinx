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

## Setting it up, once, from Silinx

In the **Collaboration** tab, the **Cloudflare Relay** box: *Set Up a Cloudflare Relay…*.

1. **Its key**: Silinx makes a long random key in your page. *Copy* it, and keep it somewhere safe, as you would a
   password.
2. **Deploy it**: *Deploy to Cloudflare* opens Cloudflare in a new tab. The window's *Cloudflare's screens, step by
   step* lists what you meet there (below).
3. **Its address**: paste it in the window and click *Check and Save*.

### Cloudflare's screens, step by step

Cloudflare's own labels are in English, as Cloudflare shows them.

1. **Sign in.** *Deploy to Cloudflare* opens Cloudflare's dashboard at *Workers & Pages* ▸ *Create an application* ▸
   **Set up your application**. Sign in to Cloudflare, or create a free account.
2. **Git account.** The list shows the accounts already connected, and *New GitHub connection* / *New GitLab
   connection*. Choose your GitHub account, the one Silinx's Collaboration tab already uses (GitLab works the same
   way). The first time, GitHub asks you to install Cloudflare's app (*Cloudflare Workers and Pages*). Give it **All
   repositories**: Cloudflare creates a new repository for the relay, and *Only select repositories* can only list
   repositories that already exist. Once the relay is deployed, you can narrow it: on GitHub, *Settings* ▸
   *Applications* ▸ *Cloudflare Workers and Pages* ▸ *Configure* ▸ *Only select repositories*, the relay's repository
   alone.
3. **Repository.** Cloudflare says that a Git repository will be created for you and that every push to it is deployed.
   Tick **Create private Git repository**. Your copy of the relay goes there; the key is not in it (it is a secret
   kept by Cloudflare).
4. **Project name.** Leave `silinx-relay`. It becomes your relay's address,
   `https://silinx-relay.<your subdomain>.workers.dev`.
5. **RELAY_KEY.** A password field: paste the key that Silinx made and copied.
6. **ORIGINS.** Leave `https://pmnmalo.github.io`, the Silinx site. If you also use Silinx's local server
   (`silinx serve`) or another Silinx site, add its address after a space, for example
   `https://pmnmalo.github.io http://127.0.0.1:8642`.
7. **Build and deploy commands.** *Build command* empty, *Deploy command* `npm run deploy` (it runs `wrangler deploy`),
   preview builds off: leave them as they are.
8. **Deploy.** Click *Deploy*. Cloudflare says *Setting up your repository…*, then opens the Worker's build page:
   *Initializing* (about a minute and a half the first time), *Cloning* (it copies the Silinx repository, which takes a
   while), *Installing*, *Deploying*. Wait a few minutes for the green **Success**.
9. **The address.** In the Worker's *Overview*, *Domains & Routes* (or the last lines of the build's log):
   `https://silinx-relay.<your subdomain>.workers.dev`. Paste it in Silinx's window and click *Check and Save*.

Traps:

- Use the *Deploy to Cloudflare* button. Cloudflare's *Workers & Pages* ▸ *Create* ▸ *Import a repository* only lists
  the repositories you already have: it does not make the copy.
- Your copy does not follow Silinx's. To update the relay, push the relay's new files
  ([`packages/silinx-relay-cloudflare`](../../../packages/silinx-relay-cloudflare/README.md)) to your repository:
  Cloudflare deploys each push.
- The free plan has daily limits (below).

Silinx checks the relay before it keeps it: it answers as a relay of Silinx's shared projects, it lets the Silinx site
in, and its key opens a meeting point. What it found is in the console. If the relay does not let the site in, the
console gives the exact line to set, `ORIGINS = "…"`: set it in Cloudflare's dashboard (the Worker's *Settings* ▸
*Variables and Secrets*) or in `wrangler.toml`, and deploy it again.

The box then shows the relay, with *Check Cloudflare Relay*, *Change Cloudflare Relay…* and *Forget Cloudflare Relay*.
Silinx never needs your Cloudflare account nor a token of its API: only the relay's address and its key, which stay in
this browser and never go into a link.

### From a terminal instead

In the [relay's folder](../../../packages/silinx-relay-cloudflare/README.md): `npx wrangler deploy`, then
`npx wrangler secret put RELAY_KEY`. Then give its address and key in *Set Up a Cloudflare Relay…*.

## Sharing through it

*Share Project…* ▸ *Live* uses it by default: **Cloudflare relay** (the address) and **Its key (RELAY_KEY)** are filled
in. Change them there, or clear them to share without it. The link names the relay, so your followers need nothing but
the link: no key, no account.

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
through the relays the user's settings name. Its `live_relay` tool sets a Cloudflare relay of its own (a key made,
the relay checked, kept in `config.json`), and `share_project` with `relay: true` shares through it.

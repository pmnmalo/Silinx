In short:

- **Set Up a Cloudflare Relay… explains Cloudflare's screens, step by step:** the Git account and the GitHub app's
  access, the private repository, the project name, RELAY_KEY, ORIGINS, the commands to leave as they are, the build's
  minutes and where the address is at the end.

In detail:

- **Cloudflare's screens, step by step (#4630):** the Set Up a Cloudflare Relay window has a foldable list of the nine
  screens Deploy to Cloudflare goes through, in order, with what to click and what to type (open while no relay is
  set, folded in Change Cloudflare Relay…), and its traps: Create ▸ Import a repository makes no copy, and the copy is
  updated by pushing to it. Translated into Portuguese; the relay's README and the user's guide (`live-relay`, in
  English and Portuguese) give the same steps.
- **The relay's `wrangler.toml` says `workers_dev = true` and `preview_urls = false` (#4630):** a deploy's build log
  no longer warns that neither is set.

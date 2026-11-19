In detail:

- **The docs site's builder on Windows (#4547):** `scripts/build-docs-site.mjs` returns the pages it wrote with `/`, on
  Windows too, as the pictures; its test found no page there.

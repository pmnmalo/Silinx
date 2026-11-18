In short:

- **The user's guide on the site:** https://pmnmalo.github.io/Silinx/docs/ shows the user's guide, in English and in
  Portuguese (the browser's language first), with its screenshots, beside the app.

In detail:

- **The user's guide on the Pages site (#4504):** `scripts/build-docs-site.mjs` makes `docs/user/<lang>/*.md` into
  plain HTML pages in the site's `docs/<lang>/` (the guide's own Markdown, no Markdown package: headings with
  GitHub's anchors, lists, tables, quotes, code, links, pictures), a link to a page of the guide its HTML page, to any
  other file of the repository the file on GitHub; `docs/images/` beside them, and `docs/index.html` choosing the
  language. The Pages workflow runs it after the editions, from main's commit. The service worker leaves `docs/` to
  the network. `test/build-docs-site.test.js`: the conversion, the links, and the site built whole with every local
  link, anchor and picture found.

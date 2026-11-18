In detail:

- **The docs site's builder uses the shared XML escape (#4527):** scripts/build-docs-site.mjs (#4504) imports `escXml` from
  core/escape.js in place of its own copy, which test/ident-escape.test.js refuses (#3545); the site's pages the same bytes.

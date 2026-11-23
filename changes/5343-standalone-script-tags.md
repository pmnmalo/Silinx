In detail:

- **The standalone build's script inlining in a module of its own, stricter (#5343):** `scripts/inline-scripts.mjs`
  replaces each `<script src="…"></script>` of `web/index.html` with the script itself, an end tag with spaces before
  its `>` too, and fails the build on a tag with a `src` of another form (but the app's module, which the build
  replaces itself), instead of leaving the single file a script it does not have. `safeJs` moved with it, unchanged.
  Test: inline-scripts (the tags replaced, the odd ones refused, `web/index.html`'s own, `safeJs`).

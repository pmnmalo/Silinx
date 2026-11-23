In detail:
- The single file's inlined code writes `<script` as `<\x73cript` (scripts/inline-scripts.mjs safeJs), the same text when it runs: a development build's changes quoting a script tag (a changelog fragment's text, #5343's) no longer put one in the page, which the dist test's "no external scripts" refused; the notices' plain text keeps only its `</script` escaped (safeText) (#5389).

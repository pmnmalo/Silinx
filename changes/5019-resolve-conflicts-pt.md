In detail:

- **Resolve Conflicts in Portuguese again (#5019):** the dialog's line, "N object(s) changed both here and on GitHub…"
  (Pull from GitHub) or "… on both branches…" (Merge Branch), was half English in Portuguese since #4748: its broader
  pattern in `web/js/i18n-messages.js`, matched first, left "both here and on GitHub" untranslated. That pattern is
  gone; `web/js/i18n-git.js`'s own two, one for each place the objects changed, translate it whole.

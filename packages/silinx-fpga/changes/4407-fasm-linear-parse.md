In detail:

- **The 7-series' FASM read in a time linear in a line's length (#4407, CodeQL's js/polynomial-redos):** `parseFasm`
  cuts a line by hand into its feature, its annotations and its comment, each matched by a pattern with one way to
  match a text, and checks a plain decimal value without the pattern `[0-9_]*[0-9][0-9_]*`. A line that is not FASM,
  with long runs of blanks or digits, took a time growing with a power of its length (2000 blanks 2.7 s; a value of
  50000 digits ending in `'` minutes); now milliseconds. What it reads and the errors it gives are the same (but a
  value's trailing blanks, no more in its error message).

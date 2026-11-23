// The standalone page's external scripts inlined (scripts/build-standalone.mjs, #5343): every `<script src="…"></script>`
// of web/index.html (the repository's own page, at build time) becomes the script `inline(src)` returns, an end tag
// with spaces before its `>` too. Any other tag with a src (but those of `keep`, which the build inlines itself) fails
// the build rather than leaving the single file a script it does not have.

const TAG = /<script src="([^"]+)"><\/script\s*>/gi;

/** `html` with its `<script src>` tags replaced by `inline(src)` (a whole `<script>` element); throws on a tag with a
 *  src of another form, unless it is one of `keep` (its exact text). */
export function inlineScripts(html, inline, { keep = [] } = {}) {
  const odd = html.replace(TAG, '').match(/<script\b[^>]*\bsrc\s*=[^>]*>/gi)?.find(t => !keep.some(k => k.startsWith(t)));
  if (odd) throw new Error(`web/index.html: a script the standalone build cannot inline (not <script src="…"></script>): ${odd}`);
  return html.replace(TAG, (m, src) => inline(src));
}

/** Code put inside a `<script>` element: its `</script` (any case) escaped, so it cannot close the element; its
 *  `<script` written `<\x73cript`, the same text in a string, a template or a regular expression, so that none is a tag
 *  in the page (a development build's changes quoting `<script src="…">`, #5389). */
export const safeJs = js => js.replace(/<\/script/gi, '<\\/script').replace(/<(s)(cript)/gi, (m, s, rest) => `<\\x${s.charCodeAt(0).toString(16)}${rest}`);

/** Text put inside a `<script type="text/plain">` element (the notices): only its `</script` escaped. */
export const safeText = text => text.replace(/<\/script/gi, '<\\/script');

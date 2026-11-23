// The standalone build's script inlining (scripts/inline-scripts.mjs, #5343): every <script src="…"></script> of the
// page replaced, an end tag with spaces before its > too; a tag with a src of another form refused (the build fails
// rather than leaving the single file a script it does not have), but the app's module, which the build replaces itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inlineScripts, safeJs, safeText } from '../scripts/inline-scripts.mjs';

const APP = '<script type="module" src="/js/app.js"></script>';
const inline = src => `<script>/* ${src} */</script>`;

test('#5343 inlineScripts: each <script src> replaced, </script > too, the other scripts kept', () => {
  const html = '<head><script>let a = 1;</script>\n<script src="/a.js"></script>\n<script src="/b.js"></script >\n'
    + '<SCRIPT src="/c.js"></Script\t>\n</head>';
  assert.equal(inlineScripts(html, inline), '<head><script>let a = 1;</script>\n<script>/* /a.js */</script>\n'
    + '<script>/* /b.js */</script>\n<script>/* /c.js */</script>\n</head>');
  assert.equal(inlineScripts('<p></p>', inline), '<p></p>');
});

test('#5343 inlineScripts: a tag with a src of another form fails the build; the kept one stays', () => {
  for (const tag of ['<script defer src="/a.js"></script>', "<script src='/a.js'></script>", '<script src="/a.js" async></script>',
    '<script src = "/a.js"></script>', '<script src="/a.js">\n</script>']) {
    assert.throws(() => inlineScripts(`<head>${tag}</head>`, inline), { message: /^web\/index\.html: a script the standalone build cannot inline \(not <script src="…"><\/script>\): <script/ }, tag);
  }
  assert.throws(() => inlineScripts(APP, inline), /cannot inline/);
  assert.equal(inlineScripts(`${APP}\n<script src="/a.js"></script>`, inline, { keep: [APP] }), `${APP}\n<script>/* /a.js */</script>`);
});

test('#5343 inlineScripts on web/index.html: its two external scripts inlined, the app module kept, no src left but its', () => {
  const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const seen = [];
  const out = inlineScripts(html, src => { seen.push(src); return '<script></script>'; }, { keep: [APP] });
  assert.deepEqual(seen, ['/build-channel.js', '/vendor/elk/elk.bundled.js']);
  assert.deepEqual(out.match(/<script\b[^>]*\bsrc\s*=[^>]*>/gi), ['<script type="module" src="/js/app.js">']);
});

test('#5343 safeJs: </script in any case escaped (as <\\/script)', () => {
  assert.equal(safeJs('a("</script>"); b("</SCRIPT >")'), 'a("<\\/script>"); b("<\\/script >")');
  assert.equal(safeJs('x < y'), 'x < y');
});

// #5389: a development build carries its changes' text, which may quote a script tag (#5343's did): no `<script` in
// the page's code, the same text at run time in a string, a template and a regular expression; the notices' text as it is
test('#5389 safeJs: <script in any case written <\\x73cript, the same text when run; safeText: only </script escaped', () => {
  const code = 'const a = "<script src=\\"x.js\\"></script>", t = `<Script>`, r = /<SCRIPT\\b/;';
  const safe = safeJs(code);
  assert.doesNotMatch(safe, /<script/i);
  assert.equal(safe, 'const a = "<\\x73cript src=\\"x.js\\"><\\/script>", t = `<\\x53cript>`, r = /<\\x53CRIPT\\b/;');
  const run = new Function(`${safe}; return [a, t, r.test('<SCRIPT src'), r.test('<scripts')];`)();
  assert.deepEqual(run, ['<script src="x.js"></script>', '<Script>', true, false]);
  assert.equal(safeText('see <script src="x.js"></script>'), 'see <script src="x.js"><\\/script>');
});

#!/usr/bin/env node
// The user's guide on the Pages site (#4504): docs/user/<lang>/*.md made into plain HTML pages under <site>/docs/<lang>/,
// with docs/images/ beside them, by .github/workflows/pages.yml after the editions are built. Its Markdown is the
// guide's own, the subset GitHub renders that the pages use (headings, paragraphs, lists, tables, quotes, code, links,
// pictures, bold, italics), so no Markdown package is needed. A link to another page of the guide goes to its HTML
// page; a link to any other file of the repository goes to it on GitHub.
//
//   node scripts/build-docs-site.mjs <site folder>        (e.g. site: the pages in site/docs/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escXml as esc } from '../core/escape.js';   // (the shared escape, #3545, #4527)

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = 'https://github.com/pmnmalo/Silinx/blob/main/';
const LANGS = { en: 'en', pt: 'pt-PT' };

/** GitHub's anchor of a heading (as test/docs.test.js computes it). */
export const slug = (s) => s.trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');

/** A link's address on the site, from the page `from` (a path under docs/user/, e.g. 'en/boards.md'). */
export function siteUrl(url, from) {
  if (/^(https?:|mailto:|#)/.test(url)) return url;
  const [p, a] = url.split('#');
  const target = path.posix.normalize(path.posix.join('docs/user', path.posix.dirname(from), p));
  const hash = a ? `#${a}` : '';
  // a page of the guide: its HTML page; a picture: the site's copy; any other file: GitHub's
  if (/^docs\/user\/(en|pt)\/[\w-]+\.md$/.test(target)) {
    const rel = path.posix.relative(path.posix.dirname(path.posix.join('docs/user', from)), target);
    return rel.replace(/(^|\/)README\.md$/, '$1index.html').replace(/\.md$/, '.html') + hash;
  }
  if (target.startsWith('docs/images/')) return `../images/${target.slice('docs/images/'.length)}`;
  return REPO + target + hash;
}

/** A line's inline Markdown: code, pictures, links, bold, italics. */
export function inline(text, from) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(`<code>${esc(c)}</code>`) - 1}\u0000`);
  s = esc(s).replace(/&lt;br&gt;/g, '<br>');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, u) => `<img src="${siteUrl(u.replace(/&amp;/g, '&'), from)}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${siteUrl(u.replace(/&amp;/g, '&'), from)}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(])(https:\/\/[^\s<)]+[^\s<).,;:])/g, '$1<a href="$2">$2</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** A page's Markdown as HTML (its body). */
export function markdown(md, from) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => { if (para.length) out.push(`<p>${inline(para.join(' '), from)}</p>`); para.length = 0; };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const body = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i]);
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      i++;
    } else if (/^#{1,6} /.test(line)) {
      flush();
      const [, h, t] = /^(#+) +(.+)$/.exec(line);
      out.push(`<h${h.length} id="${slug(t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, ''))}">${inline(t, from)}</h${h.length}>`);
      i++;
    } else if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || '')) {
      flush();
      const head = cells(line);
      i += 2;
      const rows = [];
      for (; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c, from)}</th>`).join('')}</tr></thead><tbody>${
        rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, from)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else if (/^(- |\d+\. )/.test(line)) {
      flush();
      const ordered = /^\d/.test(line);
      const items = [];
      for (; i < lines.length && (/^(- |\d+\. )/.test(lines[i]) || (/^ {2,}\S/.test(lines[i]) && items.length) || (lines[i] === '' && /^ {2,}\S/.test(lines[i + 1] || '') && items.length)); i++) {
        if (/^(- |\d+\. )/.test(lines[i])) items.push([lines[i].replace(/^(- |\d+\. )/, '')]);
        else items[items.length - 1].push(lines[i].trim());
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((it) => `<li>${markdownItem(it, from)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
    } else if (/^> ?/.test(line)) {
      flush();
      const q = [];
      for (; i < lines.length && /^>/.test(lines[i]); i++) q.push(lines[i].replace(/^> ?/, ''));
      out.push(`<blockquote>${markdown(q.join('\n'), from)}</blockquote>`);
    } else if (/^-{3,}$/.test(line)) { flush(); out.push('<hr>'); i++; }
    else if (line.trim() === '') { flush(); i++; }
    else { para.push(line.trim()); i++; }
  }
  flush();
  return out.join('\n');
}
// a list item's lines: its text, a picture or a sub-list on its own lines kept as such
function markdownItem(lines, from) {
  const blocks = [];
  let text = [];
  for (const l of lines) {
    if (l === '') { if (text.length) blocks.push(inline(text.join(' '), from)); text = []; } else if (/^!\[/.test(l)) { if (text.length) blocks.push(inline(text.join(' '), from)); text = []; blocks.push(inline(l, from)); } else text.push(l);
  }
  if (text.length) blocks.push(inline(text.join(' '), from));
  return blocks.join('<br>');
}

const CSS = `:root{--fg:#1d2433;--muted:#5b6475;--bg:#fff;--line:#d9dee7;--link:#1f5fd1;--code:#f3f5f9}
@media (prefers-color-scheme:dark){:root{--fg:#e6e9ef;--muted:#a3abba;--bg:#14171d;--line:#2c323d;--link:#7aa7ff;--code:#1e232b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
header{border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header a{color:var(--fg);text-decoration:none;font-weight:600}header .try{margin-left:auto;background:#c62828;color:#fff;border-radius:6px;padding:6px 12px}
main{max-width:920px;margin:0 auto;padding:16px}a{color:var(--link)}img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:6px}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
code{background:var(--code);padding:1px 4px;border-radius:4px;font-size:.92em}pre{background:var(--code);padding:12px;overflow-x:auto;border-radius:6px}pre code{padding:0}
blockquote{margin:0;padding:0 12px;border-left:4px solid var(--line);color:var(--muted)}h1{line-height:1.25}footer{color:var(--muted);font-size:.9em;padding:24px 16px;text-align:center}`;

/** A page of the guide, whole. */
export function page(md, from, lang) {
  const title = (/^# (.+)$/m.exec(md)?.[1] || 'Silinx').replace(/[*`]/g, '');
  const guide = lang === 'pt' ? 'Guia do utilizador' : "User's guide", tryIt = lang === 'pt' ? 'Experimentar o Silinx' : 'Try Silinx';
  return `<!doctype html>
<html lang="${LANGS[lang]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Silinx</title><style>${CSS}</style></head>
<body><header><a href="index.html">Silinx · ${guide}</a><a class="try" href="../../">${tryIt}</a></header>
<main>
${markdown(md, from)}
</main>
<footer>Silinx · <a href="https://github.com/pmnmalo/Silinx">GitHub</a> · AGPL-3.0-only</footer>
</body></html>
`;
}

/** The guide written into <site>/docs/: each language's pages, the pictures. Returns the files written (relative to
 *  <site>, with /). */
export function build(site) {
  const out = path.join(site, 'docs');
  const written = [];
  for (const lang of Object.keys(LANGS)) {
    const dir = path.join(ROOT, 'docs/user', lang);
    fs.mkdirSync(path.join(out, lang), { recursive: true });
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      const file = path.join(out, lang, f === 'README.md' ? 'index.html' : f.replace(/\.md$/, '.html'));
      fs.writeFileSync(file, page(fs.readFileSync(path.join(dir, f), 'utf8'), `${lang}/${f}`, lang));
      written.push(`docs/${lang}/${path.basename(file)}`);   // (with /, on Windows too: #4547)
    }
  }
  fs.mkdirSync(path.join(out, 'images'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'docs/images')).filter((x) => x.endsWith('.webp'))) {
    fs.copyFileSync(path.join(ROOT, 'docs/images', f), path.join(out, 'images', f));
    written.push(`docs/images/${f}`);
  }
  // docs/ itself: the guide in the browser's language
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Silinx</title>
<meta http-equiv="refresh" content="0; url=en/index.html"><script>if(/^pt/i.test(navigator.language))location.replace('pt/index.html')</script></head>
<body><a href="en/index.html">User's guide</a> · <a href="pt/index.html">Guia do utilizador</a></body></html>
`);
  written.push('docs/index.html');
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const site = process.argv[2];
  if (!site) { console.error('usage: node scripts/build-docs-site.mjs <site folder>'); process.exit(2); }
  const files = build(path.resolve(site));
  console.log(`The user's guide: ${files.filter((f) => f.endsWith('.html')).length} pages, ${files.filter((f) => f.endsWith('.webp')).length} pictures in ${path.join(site, 'docs')}`);
}

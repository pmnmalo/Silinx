// The user's guide on the Pages site (#4504, scripts/build-docs-site.mjs): its Markdown made into HTML, its links made
// into the site's (a page of the guide, a picture) or GitHub's (any other file), and the site it writes whole: every
// local link and picture of every page found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { siteUrl, inline, markdown, page, build, slug, REPO } from '../scripts/build-docs-site.mjs';

test('docs site: a link to a page of the guide, a picture, another file, an address', () => {
  assert.equal(siteUrl('boards.md', 'en/README.md'), 'boards.html');
  assert.equal(siteUrl('features.md#guided-labs', 'en/teaching.md'), 'features.html#guided-labs');
  assert.equal(siteUrl('../pt/boards.md', 'en/boards.md'), '../pt/boards.html');
  assert.equal(siteUrl('../en/README.md', 'pt/README.md'), '../en/index.html');
  assert.equal(siteUrl('README.md', 'pt/faq.md'), 'index.html');
  assert.equal(siteUrl('../../images/hero.webp', 'en/what-is-silinx.md'), '../images/hero.webp');
  assert.equal(siteUrl('../../HISTORY.md', 'en/what-is-silinx.md'), `${REPO}docs/HISTORY.md`);
  assert.equal(siteUrl('../../../CONTRIBUTING.md#x', 'en/README.md'), `${REPO}CONTRIBUTING.md#x`);
  assert.equal(siteUrl('https://pmnmalo.github.io/Silinx/', 'en/faq.md'), 'https://pmnmalo.github.io/Silinx/');
  assert.equal(siteUrl('#its-tools', 'en/ai-mcp.md'), '#its-tools');
});

test('docs site: inline Markdown, the HTML in the text escaped, the code kept as it is', () => {
  assert.equal(inline('**Bold**, *italics*, `a <b> *c*`, [a page](boards.md) and ![a picture](../../images/x.webp)', 'en/a.md'),
    '<strong>Bold</strong>, <em>italics</em>, <code>a &lt;b&gt; *c*</code>, <a href="boards.html">a page</a> and <img src="../images/x.webp" alt="a picture" loading="lazy">');
  assert.equal(inline('open https://pmnmalo.github.io/Silinx/, then <script>', 'en/a.md'),
    'open <a href="https://pmnmalo.github.io/Silinx/">https://pmnmalo.github.io/Silinx/</a>, then &lt;script&gt;');
  assert.equal(inline('a*b and 2 * 3 * 4', 'en/a.md'), 'a*b and 2 * 3 * 4');
});

test('docs site: the blocks: headings with GitHub\'s anchors, lists, tables, code, quotes', () => {
  const html = markdown(['# The title', '', 'A paragraph', 'on two lines.', '', '## Boards and toolchains', '',
    '- one', '  continued', '- two', '', '1. first', '2. second', '', '| A | B |', '|---|---|', '| `x` | [y](faq.md) |', '',
    '```bash', 'npm run docs:screenshots -- <shot>', '```', '', '> a quote', ''].join('\n'), 'en/a.md');
  assert.equal(html, [
    '<h1 id="the-title">The title</h1>', '<p>A paragraph on two lines.</p>', '<h2 id="boards-and-toolchains">Boards and toolchains</h2>',
    '<ul><li>one continued</li><li>two</li></ul>', '<ol><li>first</li><li>second</li></ol>',
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><code>x</code></td><td><a href="faq.html">y</a></td></tr></tbody></table>',
    '<pre><code>npm run docs:screenshots -- &lt;shot&gt;</code></pre>', '<blockquote><p>a quote</p></blockquote>'].join('\n'));
  assert.equal(slug('Circuitos, redes de Petri e C'), 'circuitos-redes-de-petri-e-c');
});

test('docs site: a page whole: its language, title, the way back to the guide and to the app', () => {
  const html = page('# Perguntas e respostas\n\nTexto.\n', 'pt/faq.md', 'pt');
  assert.match(html, /^<!doctype html>\n<html lang="pt-PT">/);
  assert.match(html, /<title>Perguntas e respostas · Silinx<\/title>/);
  assert.match(html, /<a href="index.html">Silinx · Guia do utilizador<\/a><a class="try" href="..\/..\/">Experimentar o Silinx<\/a>/);
  assert.match(page('# FAQ\n', 'en/faq.md', 'en'), /<html lang="en">[\s\S]*User's guide/);
});

test('docs site: the guide built, each language\'s pages and the pictures; every local link and picture found', () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-docs-site-'));
  try {
    const files = build(site);
    for (const lang of ['en', 'pt']) {
      const md = fs.readdirSync(`docs/user/${lang}`).filter((f) => f.endsWith('.md'));
      assert.equal(files.filter((f) => f.startsWith(`docs/${lang}/`)).length, md.length, lang);
      assert.ok(files.includes(`docs/${lang}/index.html`), `${lang}: its index`);
    }
    assert.ok(files.includes('docs/images/hero.webp') && files.includes('docs/index.html'));
    const bad = [];
    for (const f of files.filter((x) => x.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(site, f), 'utf8');
      for (const [, u] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (/^(https?:|mailto:|#)/.test(u) || u === '../../') continue;
        const [p, a] = u.split('#');
        const target = path.join(site, path.dirname(f), p);
        if (!fs.existsSync(target)) { bad.push(`${f}: ${u}`); continue; }
        if (a && !fs.readFileSync(target, 'utf8').includes(`id="${a}"`)) bad.push(`${f}: ${u} (no such anchor)`);
      }
    }
    assert.deepEqual(bad, []);
  } finally { fs.rmSync(site, { recursive: true, force: true }); }
});

test('docs site: the Pages workflow builds the guide into the site, after the stable edition empties it', () => {
  const yml = fs.readFileSync('.github/workflows/pages.yml', 'utf8');
  const stable = yml.indexOf('build-standalone.mjs --site "$GITHUB_WORKSPACE/site"'), guide = yml.indexOf('run: node scripts/build-docs-site.mjs site\n');
  assert.ok(stable > 0 && guide > stable, 'the guide built after the stable edition');
  assert.match(yml, /https:\/\/pmnmalo\.github\.io\/Silinx\/docs\/ {2}the user's guide/);
});

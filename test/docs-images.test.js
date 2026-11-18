// The documentation's screenshots (#4499): every picture a document shows exists, every picture in docs/images/ is
// one scripts/docs-screenshots.mjs makes (so running it again brings them all up to date), and each stays small.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, shotFile, shotFiles, MAX_BYTES } from '../scripts/docs-screenshots.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = path.join(ROOT, 'docs', 'images');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.name.startsWith('.') || ['node_modules', 'dist', 'test'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') ? [path.join(d, e.name)] : []);
const pictures = () => fs.readdirSync(IMAGES).filter((f) => /\.(webp|png|jpe?g|gif|svg)$/.test(f));

test('docs images: the file of a shot by its interface and language', () => {
  const s = { name: 'hero' };
  assert.deepEqual([shotFile(s, 'silinx', 'en'), shotFile(s, 'ise', 'en'), shotFile(s, 'silinx', 'pt'), shotFile(s, 'ise', 'pt')],
    ['hero.webp', 'hero-ise.webp', 'hero-pt.webp', 'hero-ise-pt.webp']);
  assert.deepEqual(shotFiles([{ name: 'a' }, { name: 'b', ui: ['silinx', 'ise'], lang: ['en', 'pt'] }]),
    ['a.webp', 'b.webp', 'b-pt.webp', 'b-ise.webp', 'b-ise-pt.webp']);
});

test('docs images: the shots have distinct names, a description, and their interfaces and languages are known', () => {
  const names = SHOTS.map((s) => s.name);
  assert.equal(new Set(names).size, names.length, 'a name used twice');
  for (const s of SHOTS) {
    assert.match(s.name, /^[a-z0-9-]+$/, s.name);
    assert.ok(s.about, `${s.name}: no description`);
    assert.equal(typeof s.run, 'function', s.name);
    for (const ui of s.ui || []) assert.ok(['silinx', 'ise'].includes(ui), `${s.name}: interface ${ui}`);
    for (const l of s.lang || []) assert.ok(['en', 'pt'].includes(l), `${s.name}: language ${l}`);
  }
});

test('docs images: every shot\'s picture is in docs/images/, and every picture there is a shot\'s (npm run docs:screenshots)', () => {
  const have = pictures(), made = shotFiles();
  assert.deepEqual(made.filter((f) => !have.includes(f)), [], 'not made yet: run npm run docs:screenshots');
  assert.deepEqual(have.filter((f) => !made.includes(f)), [], 'made by no shot of scripts/docs-screenshots.mjs');
});

test('docs images: each picture is a WebP image and stays small', () => {
  for (const f of pictures()) {
    const b = fs.readFileSync(path.join(IMAGES, f));
    assert.equal(b.subarray(0, 4).toString(), 'RIFF', f);
    assert.equal(b.subarray(8, 12).toString(), 'WEBP', f);
    assert.ok(b.length <= MAX_BYTES, `${f}: ${(b.length / 1024).toFixed(0)} KB (at most ${MAX_BYTES / 1024} KB)`);
  }
});

test('docs images: every picture a Markdown file shows exists', () => {
  const bad = [];
  for (const f of walk(ROOT)) {
    const text = fs.readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
    const srcs = [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g), ...text.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
    for (const src of srcs) {
      if (/^(https?:|data:)/.test(src)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(f), decodeURIComponent(src.split('#')[0])))) bad.push(`${path.relative(ROOT, f)}: ${src}`);
    }
  }
  assert.deepEqual(bad, []);
});

// The colours written in the interface's code (#4763): a hex colour literal in web/js ('#15428b', `#fff`) is a colour
// that stays the same in the dark themes, unless it is a board's or a print's own. Their number per file only goes
// down: a file may not have more than LIMITS says, a file not listed none; one with fewer has its limit lowered here
// (the ratchet kept tight). A colour of the interface is a theme's variable (web/css/theme.css, its dark themes), read
// by the code (SSim's: web/js/isim-colors.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const HEX = /['"`]#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
// the most each file may have (web/js/<file>), at #4763
const LIMITS = {
  'devmenu-pointer.js': 8, 'editor-icons.js': 77, 'emulator-atlys.js': 53, 'emulator-basys2.js': 42,
  'emulator-basys3.js': 33, 'emulator-board.js': 2, 'emulator-cmod-s6.js': 16, 'emulator-elbert-v2.js': 59,
  'emulator-icebreaker.js': 65, 'emulator-mimas-v2.js': 57, 'emulator-nexys-a7.js': 40, 'emulator-nexys2.js': 46,
  'emulator-nexys3.js': 45, 'emulator-paint.js': 2, 'emulator-papilio-one.js': 25, 'emulator-pcb.js': 7,
  'emulator-s3-starter.js': 44, 'emulator-s3a.js': 69, 'emulator-s3e.js': 59, 'emulator-tangnano9k.js': 47,
  'emulator-ulx3s.js': 58, 'emulator.js': 2, 'fpgaview.js': 22, 'fsm-look.js': 1, 'icons.js': 191,
  'isim-colors.js': 25, 'isim-draw-wave.js': 1, 'isim-draw.js': 16, 'isim-print.js': 21, 'isim-stimuli.js': 2,
  'isim.js': 73, 'print.js': 1, 'schematic-export.js': 1, 'schematic-view.js': 13, 'truthtable.js': 10,
  'wizards.js': 2,
};

/** The hex colour literals of each of the given sources: { file: count } (none: not listed). */
function hexCounts(sources) {
  const out = {};
  for (const [f, text] of Object.entries(sources)) { const n = (text.match(HEX) || []).length; if (n) out[f] = n; }
  return out;
}

test('#4763 the counter: quoted hex colours, not other # words', () => {
  assert.deepEqual(hexCounts({ a: "c = '#15428b'; d = \"#fff\"; e = `#ffcc00aa`", b: "x = '#issue'; y = '#12'; z = 'a#fff'; /* #fff */", c: '' }), { a: 3 });
});

test('#4763 the hex colour literals of web/js only go down', () => {
  const files = execFileSync('git', ['ls-files', 'web/js'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter((f) => f.endsWith('.js'));
  const now = hexCounts(Object.fromEntries(files.map((f) => [f.slice('web/js/'.length), fs.readFileSync(path.join(ROOT, f), 'utf8')])));
  const over = Object.entries(now).filter(([f, n]) => n > (LIMITS[f] ?? 0)).map(([f, n]) => `${f}: ${n} (at most ${LIMITS[f] ?? 0}: a theme's variable instead)`);
  const under = Object.entries(LIMITS).filter(([f, n]) => (now[f] ?? 0) < n).map(([f, n]) => `${f}: ${now[f] ?? 0} (its limit ${n}: lower it here)`);
  assert.deepEqual([...over, ...under], []);
});

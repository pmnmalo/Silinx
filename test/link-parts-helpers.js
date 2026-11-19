// A project's KiCad parts for the tests of its link (#4573, core/link-parts.js): libraries of which a drawing uses a few
// symbols (test/fixtures/kicad's), and `unused` symbols no drawing uses, their descriptions hard to compress, which made
// the link too long to be made (as the libraries a course's project imports).
import fs from 'node:fs';
import path from 'node:path';

const FIX = path.join(import.meta.dirname, 'fixtures', 'kicad');
const read = (rel) => fs.readFileSync(path.join(FIX, rel), 'utf8');
const symbol = (name, props = {}) => `(kicad_symbol_lib
\t(version 20251024)
\t(generator "silinx_test")
\t(symbol "${name}"
\t\t(property "Reference" "U" (at 0 0 0))
\t\t(property "Value" "${name}" (at 0 0 0))
${Object.entries(props).map(([k, v]) => `\t\t(property "${k}" "${v}" (at 0 0 0))\n`).join('')}\t\t(symbol "${name}_1_1"
\t\t\t(pin input line (at -5.08 0 0) (length 2.54) (name "A") (number "1"))
\t\t\t(pin output line (at 5.08 0 180) (length 2.54) (name "Y") (number "2"))
\t\t)
\t)
)
`;
// (a description of hex digits a seeded generator makes: the same every run, little to compress)
function noise(seed, n) {
  let x = seed >>> 0, s = '';
  while (s.length < n) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; s += x.toString(16).padStart(8, '0'); }
  return s.slice(0, n);
}

/** The drawing's parts, its types (as a circuit names them). */
export const USED_TYPES = ['parts/logic.kicad_symdir#TESTDERIVED2', 'parts/gates.kicad_sym#TEST7400', 'parts/extra.kicad_symdir#WITHFP', 'parts/extra.kicad_symdir#WITHPCM'];

/**
 * The parts/ files and a file naming the used ones: { files: { path: text }, kept: [the part files the link keeps],
 * left: [those it leaves out], sorted }.
 */
export function kicadPartsProject({ unused = 60, user = 'src/kicad-parts.json' } = {}) {
  const files = {
    'parts/logic.kicad_symdir/TESTBASE.kicad_sym': read('logic.kicad_symdir/TESTBASE.kicad_sym'),
    'parts/logic.kicad_symdir/TESTDERIVED.kicad_sym': read('logic.kicad_symdir/TESTDERIVED.kicad_sym'),
    'parts/gates.kicad_sym': read('gates.kicad_sym'),
    'parts/extra.kicad_symdir/WITHFP.kicad_sym': symbol('WITHFP', { Footprint: 'parts:DIP-14_W7.62mm' }),
    'parts/extra.kicad_symdir/WITHPCM.kicad_sym': symbol('WITHPCM', { 'Silinx.Footprint': 'PCM_parts:Module_1x04' }),
    'parts/parts.pretty/DIP-14_W7.62mm.kicad_mod': read('parts.pretty/DIP-14_W7.62mm.kicad_mod'),
    'parts/parts.pretty/Module_1x04.kicad_mod': read('parts.pretty/Module_1x04.kicad_mod'),
    'parts/parts.pretty/LED_D5.0mm_test.kicad_mod': read('parts.pretty/LED_D5.0mm_test.kicad_mod'),
    'parts/README.md': 'Parts for the tests.\n',
  };
  for (let i = 0; i < unused; i++) files[`parts/extra.kicad_symdir/PAD${i}.kicad_sym`] = symbol(`PAD${i}`, { Description: noise(i + 1, 2400), Footprint: 'parts:LED_D5.0mm_test' });
  files[user] = `${JSON.stringify({ parts: USED_TYPES.map((type, i) => ({ id: `U${i + 1}`, type, x: i * 4, y: 0 })) }, null, 2)}\n`;
  const kept = ['parts/extra.kicad_symdir/WITHFP.kicad_sym', 'parts/extra.kicad_symdir/WITHPCM.kicad_sym', 'parts/gates.kicad_sym',
    'parts/logic.kicad_symdir/TESTBASE.kicad_sym', 'parts/logic.kicad_symdir/TESTDERIVED.kicad_sym', 'parts/parts.pretty/DIP-14_W7.62mm.kicad_mod',
    'parts/parts.pretty/Module_1x04.kicad_mod'].sort();
  const left = Object.keys(files).filter((p) => /\.kicad_(sym|mod)$/.test(p) && !kept.includes(p)).sort();
  return { files, kept, left };
}

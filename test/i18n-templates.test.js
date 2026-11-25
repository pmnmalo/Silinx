// The interface's texts written as template literals (#4748): the label scan of test/web-i18n.test.js reads single-
// quoted literals only, so a message with a name or a number in it (`cannot open ${path}: ${e.message}`, `Project
// ${pj.name} created`, a tab's `ASM chart ${name}`) went unseen and stayed in English in Portuguese. Here each one of
// the same forms (a label, a title, a toast, a console line, a dialog's message, an element's text) is translated: with
// sample values in its ${…} (a conditional's own strings), else its real text below; the same in both languages, listed.
// And the texts of an element's innerHTML; the canvas's, the SVG's and the browser's prompt's, translated by t().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js');
// the module picks the language from localStorage when it loads
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t } = await import('../web/js/i18n.js');

const SOURCES = fs.readdirSync(WEB).filter((x) => x.endsWith('.js') && !/^(i18n|schematic-demo-data|icons)/.test(x)).map((f) => [f, fs.readFileSync(path.join(WEB, f), 'utf8')]);
// a template literal: its text and ${…} (one level of braces inside)
const SUB = /\$\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;
const TPL = '`((?:[^`\\\\$]|\\\\.|\\$(?!\\{)|\\$\\{(?:[^{}`]|\\{[^{}]*\\})*\\})+)`';
const FORMS = [`\\b(?:label|title|placeholder): ${TPL}`, `\\bfield\\(${TPL}`,
  `\\bh\\('(?:h2|h3|h4|th|label|button|summary|caption|div|p|span|option|b|small|em|strong|li|legend|td)', \\{(?![^{}]*no-i18n)[^{}]*\\}, ${TPL}\\)`,
  `\\btoast\\(\\s*${TPL}`, `\\b(?:log(?:Error|Warning|Info)|message|command(?:Error|Warning|Info))\\(\\s*${TPL}`, `\\b(?:confirmDlg|promptDlg)\\(\\s*${TPL}`,
  `\\b(?:confirmDlg|promptDlg|command(?:Error|Warning|Info))\\(\\s*(?:'[^'$\`]*'|[\\w.]+),\\s*${TPL}`, `\\btextContent = ${TPL}`].map((s) => new RegExp(s, 'g'));
/** The template literals of the label forms with a ${…} and a word: [file, template]. */
export function templateLabels(src) {
  const out = [];
  for (const re of FORMS) for (const m of src.matchAll(re)) {
    const tpl = m[1];
    if (tpl.includes('${') && !tpl.includes('\\n') && /[A-Za-z]{3}/.test(tpl.replace(SUB, ''))) out.push(tpl);
  }
  return out;
}
const SAMPLES = ['2', 'x', "'x'", 'src/a.vhd', 'a', 'S0', '2 ns'];
// (a sample in each ${…}, or a conditional's k-th string)
const filled = (tpl, s, k) => tpl.replace(SUB, (m, e) => { const lits = [...e.matchAll(/'([^']*)'/g)].map((x) => x[1]); return lits.length && /\?/.test(e) ? lits[k % lits.length] : s; });
const sampled = (tpl) => SAMPLES.some((s) => [0, 1].some((k) => { const x = filled(tpl, s, k); return t(x) !== x; }));

// a template whose samples do not fit its translation (a closed set of values, a name's form): a real text of it
const EXAMPLES = {  '${doc.path || doc.title} could not be saved. Close it and lose the unsaved changes?': 'src/top.vhd could not be saved. Close it and lose the unsaved changes?',
  "New path of the folder '${dir}':": "New path of the folder 'src':",
  'Open ${viewTitle(sch)}': 'Open Circuit',
  'Generated from the ${noun}': 'Generated from the state machine',   // (a CPU node's drawing's badge, #5487)
  'cannot open ${path}: ${e.message}': 'cannot open src/a.sch.json: Unexpected end of JSON input',
  '${sel().nodes.size} boxes selected': '3 boxes selected',
  "The reset (active-${M().reset.active}, ${M().reset.sync ? 'synchronous' : 'asynchronous'}): click to toggle it": 'The reset (active-high, synchronous): click to toggle it',
  'ASM chart ${M().name}': 'ASM chart traffic',
  '${model.name} created': 'traffic created',
  'Circuit ${M.name}': 'Circuit breadboard',
  "${e.message.replace(/ \\(replace: true replaces it\\)$/, '')}. Replace the files of the library?": 'the project has it already. Replace the files of the library?',
  'Browse KiCad Libraries: ${e.message}': 'Browse KiCad Libraries: the server is not running',
  "${e.message.replace(/ \\(replace: true replaces it\\)$/, '')}. Replace it?": 'the project has it already. Replace it?',
  'KiCad catalogue: ${e.message}': 'KiCad catalogue: the server is not running',
  'KiCad catalogue: ${e2.message}': 'KiCad catalogue: the server is not running',
  'Export Parts as KiCad Package: ${e.message}': 'Export Parts as KiCad Package: no parts',
  '${f.name} is too large: ${f.size} bytes (at most ${SEXPR_LIMITS.maxBytes})': 'big.kicad_sym is too large: 9000000 bytes (at most 8000000)',
  '${lib.symbols.filter((s) => !s.power).length} symbol(s): ${kicadImportPath(f.name)}': '4 symbol(s): parts/74xx.kicad_sym',
  '${rel} is in the project already. Replace it?': 'parts/74xx.kicad_sym is in the project already. Replace it?',
  "'${dir}' is not a .kicad_symdir folder": "'lib' is not a .kicad_symdir folder",
  "'${f.name}' is not a .kicad_sym nor a .kicad_mod file's name (letters, digits, . _ -)": "'a b.txt' is not a .kicad_sym nor a .kicad_mod file's name (letters, digits, . _ -)",
  'A footprint: ${kicadImportPath(f.name)}': 'A footprint: parts/DIP-14.kicad_mod',
  'Import KiCad Part: ${e.message}': 'Import KiCad Part: no symbol',
  'Import KiCad Part: ${e2.message}': 'Import KiCad Part: no symbol',
  '${catalogueTitle(e)} (${CATALOGUE_LIBRARIES[e.library].name}, ${CATALOGUE_LIBRARIES[e.library].licence}): click it to import it into the project': '74HC00 (KiCad, CC-BY-SA 4.0): click it to import it into the project',
  'Circuit ${m.name} created': 'Circuit breadboard created',
  '${name} (compare)': 'top.sch.json (compare)',
  "${path.split('/').pop().replace(/\\.circ\\.json$/i, '')} (Schematic)": 'gates (Schematic)',
  "${ttPath.split('/').pop().replace(/\\.(tt|bool)\\.json$/i, '')} (Schematic)": 'gates (Schematic)',
  "Replace the contents of ${ttPath.split('/').pop()} by the truth table of '${mod}' (${t.inputs.length} input(s), ${t.outputs.length} output(s))?": "Replace the contents of fa.bool.json by the truth table of 'fa' (3 input(s), 2 output(s))?",
  'cannot open ${ttPath}: ${e.message}': 'cannot open src/fa.bool.json: Unexpected end of JSON input',
  'cannot open ${asmPath}: ${e.message}': 'cannot open src/t.asm.json: Unexpected end of JSON input',
  '${tip(res, k)} — click to toggle': 'SW0 = sw(0) (pin P11) — click to toggle',
  '${tip(res, k)} — press and hold (Shift+click keeps it pressed)': 'BTN0 = btn(0) (pin A7) — press and hold (Shift+click keeps it pressed)',
  "address ${a.toString(2).padStart(Math.log2(size), '0')} → ${b}": 'address 0101 → 1',
  "initial value ${init === 'INIT1' ? '1' : '0'}": 'initial value 1',
  'State diagram ${M().name}': 'State diagram traffic',
  'as it was in the commit ${shortCommit(commit)}': 'as it was in the commit 1a2b3c4',
  '${total} object(s) changed ${where}: choose whose version each one keeps. The rest of each drawing is merged by itself.': '3 object(s) changed on both branches: choose whose version each one keeps. The rest of each drawing is merged by itself.',
  '${title} failed: ${e.message}': 'Programming the PROM failed: no cable',
  "${title} failed: ${r.error || 'see log'}": 'Verifying xc3s250e failed: see log',
  'Erase the whole ${name}? The board will no longer boot a design from flash.': 'Erase the whole SPI flash? The board will no longer boot a design from flash.',
  "Sim Time: ${sim.now.toLocaleString('en-US')} ps": 'Sim Time: 1,000,000 ps',
  '${m.cycles} cycles (${timing}): ${res}': '8 cycles (clock clk, period 20 ns): 2 mismatch(es)',
  'Redo ${history.redoLabel()}': 'Redo Add Wire',
  'Undo ${history.undoLabel()}': 'Undo Add Wire',
  'Module ${p1.name()} created': 'Module counter created',
  'Schematic ${d.name} created': 'Schematic adder created',
  'Cannot open ${path || pj} in ${label}: ${e.message}': 'Cannot open src/top.vhd in VS Code: not found',
  'Petri net ${M.name}': 'Petri net ctl',
  'Petri net ${m.name} created': 'Petri net ctl created',
  "I/O Pin Planning: ${msg.join('; ')}.": 'I/O Pin Planning: 4 I/Os assigned from Digilent Basys2.',
  'cannot parse ${pj.constraints}: ${e.message}': 'cannot parse constraints/top.ucf: line 3',
  "${title} ${verb} the top module '${top}', not the selected module '${sel}'.": "Implement Design implements the top module 'a', not the selected module 'b'.",
  'Emulate ${name} Model': 'Emulate Post-Map Model',
  'Simulate ${name} Model': 'Simulate Post-Map Model',
  "${flash ? 'Programming the SPI flash' : 'Programming the FPGA'} failed: ${e.message}": 'Programming the FPGA failed: no cable',
  "${flash ? 'Programming the SPI flash' : 'Programming the FPGA'} failed: ${r.error || 'see log'}": 'Programming the SPI flash failed: see log',
  'Configuration file (${ext}):': 'Configuration file (.bit):',
  'Rename Project: ${no}.': 'Rename Project: a project named b exists already.',
  "This file was ${gone ? 'deleted' : 'changed'} ${where || 'outside Silinx'}, and it has changes in the editor not saved yet.": 'This file was changed outside Silinx, and it has changes in the editor not saved yet.',
  '${(doc().hdl?.lang || doc().lang).toUpperCase()} statements (emitted verbatim)': 'VHDL statements (emitted verbatim)',
  "Edit Symbol: module '${m.name}' has no symbol of its own (a followed project is read only)": "Edit Symbol: module 'fa' has no symbol of its own (a followed project is read only)",
  "Edit Symbol: no module '${name}' in the project's sources": "Edit Symbol: no module 'fa' in the project's sources",
  "cannot open ${path}: ${errors.join('; ')}": 'cannot open src/fa.sym.json: no pins',
  'Test bench ${path()} created': 'Test bench sim/tb_top.vhd created',
  'Translated to ${label(lang)} (read-only)': 'Translated to Verilog (read-only)',
  '${made.name} created': 'fa created',
  "${path.split('/').pop()} created": 'top.ucf created',
  '${named} exists. Replace it?': 'sim/tb_top.vhd exists. Replace it?',
  'Cannot build the design: ${e.message}': 'Cannot build the design: no top',
  'Cannot save the stimuli: ${e.message}': 'Cannot save the stimuli: read only',
  'Generate and ${action}': 'Generate and Simulate',
  'Test bench ${designOnly() ? name : path} created': 'Test bench sim/tb_top.vhd created',
  '${PRODUCT} ${VERSION_LABEL} is up to date.': 'Silinx 15.29.0 is up to date.',
  '${PRODUCT} ${VERSION} is up to date.': 'Silinx 15.29.0 is up to date.',
  '${c.path} already exists in the project. Replace it with the copy of ${f.name}?': 'src/a.vhd already exists in the project. Replace it with the copy of a.vhd?',
  'A new version is available: ${PRODUCT} ${latest}': 'A new version is available: Silinx 15.30.0',
  'About ${PRODUCT}': 'About Silinx',
  'Project ${pj.name} created': 'Project blinky created',
  'Running ${PRODUCT} ${VERSION_LABEL}. Checking for a newer version…': 'Running Silinx 15.29.0. Checking for a newer version…',
  'Running ${PRODUCT} ${VERSION}.': 'Running Silinx 15.29.0.',
  'Source Properties - ${shown}': 'Source Properties - src/top.vhd',
  'This site now serves ${PRODUCT} ${servedLabel(served)}.': 'This site now serves Silinx 15.30.0.',
  'Reachability graph${states > 200 ? \' (the first 200 markings)\' : \'\'}': 'Reachability graph (the first 200 markings)',
  'Time offsets are relative to the current simulation time (${fmtTime(sim.now)}); default unit is ns.': 'Time offsets are relative to the current simulation time (1.5 us); default unit is ns.',
};
// the same in both languages (a name, a number, a unit)
const SAME = new Set(['Firmware: ${n.firmware.split(\'/\').pop()}', '${n.id} (terminal)', '${b} baud', 'LED ${d} (${pin})', 'Cursor: ${fmtTime(st.cursor)}', 'FPGA (${top})', '${filename}.png: ${p.width} × ${p.height} px',
  // (Print's summary and the Design Summary's bitstream: a file and its size; the rest of Print's line is translated with it)
  "${n} page${n > 1 ? 's' : ''} (${L.cols} across × ${L.rows} down), ${paper.value} ${L.land ? 'landscape' : 'portrait'}; ",
  'build/${pj.top}${bitstreamExtOf(pj.device)} (${Math.round(rep.bit.size / 1024)} KB)', 'build/${pj.top}.bit (${Math.round(rep.bit.size / 1024)} KB)']);

test('#4748 the scan reads the template literals of the label forms', () => {
  const src = 'logError(`cannot open ${path}: ${e.message}`); h(\'h3\', {}, `${n} boxes selected`); toast(`${m.name} created`, \'ok\');'
    + ' commandError(\'Import\', `${f} is too large`); title: `Undo ${x}`, h(\'span\', { \'data-no-i18n\': \'\' }, `${a} b c`); log(`${a}`); textContent = `x\\n${y} words`;';
  assert.deepEqual(templateLabels(src).sort(), ['${f} is too large', 'Undo ${x}', '${n} boxes selected', '${m.name} created', 'cannot open ${path}: ${e.message}'].sort());
  // (a sample, or a conditional's own strings)
  assert.equal(filled("${flash ? 'Programming the SPI flash' : 'Programming the FPGA'} failed: ${e}", 'x', 1), 'Programming the FPGA failed: x');
});

test('#4748 every template literal label of web/js has a Portuguese translation (its real text checked when listed)', () => {
  const missing = [], seen = new Set();
  for (const [f, src] of SOURCES) for (const tpl of templateLabels(src)) {
    seen.add(tpl);
    if (SAME.has(tpl)) continue;
    const ex = EXAMPLES[tpl];
    if (ex !== undefined ? t(ex) === ex : !sampled(tpl)) missing.push(`${f}: ${tpl}`);
  }
  assert.ok(seen.size > 150, `${seen.size} templates`);
  assert.deepEqual(missing, []);
  // (no example nor same of a template the sources no longer have)
  assert.deepEqual([...Object.keys(EXAMPLES), ...SAME].filter((k) => !seen.has(k)), []);
});

const SAME_WORDS = new Set(['Hexadecimal', 'Decimal', 'Octal']);
test('#4748 the texts of an element\'s innerHTML have a Portuguese translation', () => {
  const missing = [];
  for (const [f, src] of SOURCES) for (const m of src.matchAll(/\binnerHTML\s*\+?=\s*`((?:[^`\\\\]|\\\\.)*)`/g)) {
    const texts = [...m[1].matchAll(/>([^<>]+)</g)].map((x) => x[1]).concat([...m[1].matchAll(/\b(?:title|placeholder|aria-label)="([^"]+)"/g)].map((x) => x[1]));
    for (const raw of texts) {
      const s = raw.replace(/\s+/g, ' ').trim();
      // (a file's name, SSim's prompt, the words the same in Portuguese)
      if (!/[a-z]{3}/.test(s.replace(SUB, '')) || /^[\w.-]+\.\w+$|&gt;/.test(s) || SAME_WORDS.has(s)) continue;
      if (![0, 1].some((k) => ['2', '100 ns'].some((v) => { const x = filled(s, v, k); return t(x) !== x; }))) missing.push(`${f}: ${s}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('#4748 the canvas\'s, the SVG\'s and the browser prompt\'s texts through t(); a schematic\'s title block and SSim\'s names in Portuguese', () => {
  const read = (f) => fs.readFileSync(path.join(WEB, f), 'utf8');
  assert.match(read('isim-draw.js'), /ctx\.fillText\(t\('Name'\), 8, RULER_H \/ 2\);\n\s+ctx\.fillText\(t\('Value'\),/);
  assert.match(read('sch-render.js'), /class="tb-l">\$\{esc\(t\('SHEET'\)\)\}<\/text>[\s\S]*class="tb-l">\$\{esc\(t\('LANGUAGE'\)\)\}<\/text>/);
  const rows = read('isim-rows.js');
  for (const m of rows.matchAll(/\bprompt\(([^)]*\))?[^)]*\)/g)) assert.match(m[0], /^prompt\(t\('/, m[0]);
  assert.deepEqual(['SHEET', 'LANGUAGE', 'Name', 'Value', 'Group name:', 'New Group', 'Divider name:', 'New Divider', '(never)'].map(t),
    ['FOLHA', 'LINGUAGEM', 'Nome', 'Valor', 'Nome do grupo:', 'Novo Grupo', 'Nome do divisor:', 'Novo Divisor', '(nunca)']);
  // (a message's own part translated with it: an error's text)
  assert.equal(t('cannot open src/a.vhd: Select the top module first'), 'não foi possível abrir src/a.vhd: Selecione primeiro o módulo de topo');
  assert.equal(t('Programming the FPGA failed: see log'), 'A programação da FPGA falhou: veja o registo');
  assert.equal(t('Verifying xc3s250e failed: no cable found'), 'A verificação de xc3s250e falhou: no cable found');
});

test('#5019 the Resolve Conflicts dialog\'s line in Portuguese, wherever the objects changed (a pull, a branch merged)', () => {
  assert.equal(t('1 object(s) changed both here and on GitHub: choose whose version each one keeps. The rest of each drawing is merged by itself.'),
    '1 objeto(s) alterado(s) aqui e no GitHub: escolha a versão que cada um mantém. O resto de cada desenho junta-se por si.');
  assert.equal(t('3 object(s) changed on both branches: choose whose version each one keeps. The rest of each drawing is merged by itself.'),
    '3 objeto(s) alterado(s) nos dois ramos: escolha a versão que cada um mantém. O resto de cada desenho junta-se por si.');
});

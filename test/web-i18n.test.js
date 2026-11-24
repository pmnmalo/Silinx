// web/js/i18n.js: the Portuguese dictionary is well formed and covers the UI labels written in the
// web/js sources (menus, processes, dialogs, editors).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { execSync } from 'node:child_process';
import { literalsOf } from './js-literals.js';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js');
// the module picks the language from localStorage when it loads
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t, LOCALES, getLanguage } = await import('../web/js/i18n.js');
const PT = LOCALES.pt;

test('the language comes from localStorage; English has no dictionary', () => {
  assert.equal(getLanguage(), 'pt');
  assert.deepEqual(Object.keys(LOCALES).sort(), ['en', 'pt']);
  assert.deepEqual(LOCALES.en.strings, {});
  assert.equal(LOCALES.pt.name, 'Português');
});

test('Portuguese dictionary: trimmed keys, non-empty translations, valid patterns', () => {
  const keys = Object.keys(PT.strings);
  assert.ok(keys.length > 300, `${keys.length} strings`);
  for (const k of keys) {
    assert.equal(k, k.trim(), `key '${k}' is trimmed`);
    assert.ok(k.length > 0);
    const v = PT.strings[k];
    assert.equal(typeof v, 'string', `translation of '${k}'`);
    assert.ok(v.trim().length > 0, `translation of '${k}' is not empty`);
    assert.equal(t(k), v, `t('${k}')`);
    // placeholders and code-like parts survive the translation
    for (const tok of k.match(/\$\d|\{\w+\}|%\w/g) || []) assert.ok(v.includes(tok), `'${k}' -> '${v}' keeps ${tok}`);
  }
  for (const p of PT.patterns) {
    assert.ok(Array.isArray(p) && p.length === 2, 'pattern is [regexp, replacement]');
    assert.ok(p[0] instanceof RegExp);
    assert.ok(typeof p[1] === 'string' || typeof p[1] === 'function');
    assert.ok(p[0].source.startsWith('^') && p[0].source.endsWith('$'), `pattern ${p[0]} is anchored`);
  }
});

// a key written twice in an object literal is lost to the second one (the standalone build warns of it)
test('no dictionary in web/js/i18n*.js has a key written twice (#362)', () => {
  const files = fs.readdirSync(WEB).filter((f) => /^i18n.*\.js$/.test(f));
  assert.ok(files.length >= 9, files.join(', '));
  const dups = files.flatMap((f) => transformSync(fs.readFileSync(path.join(WEB, f), 'utf8'), { loader: 'js', sourcefile: f }).warnings
    .filter((w) => w.id === 'duplicate-object-key').map((w) => `${f}:${w.location.line}: ${w.text}`));
  assert.deepEqual(dups, []);
  // the check itself: esbuild reports a key written twice
  const w = transformSync("const PT = { 'Test bench name:': 'a', 'Test bench name:': 'b' };", { loader: 'js' }).warnings;
  assert.deepEqual(w.map((x) => [x.id, x.text]), [['duplicate-object-key', 'Duplicate key "Test bench name:" in object literal']]);
});

test('t(): exact strings, patterns, surrounding whitespace, unknown text unchanged', () => {
  assert.equal(t('File'), 'Ficheiro');
  assert.equal(t('  Check Syntax  '), '  Verificar Sintaxe  ');
  assert.equal(t('Processes: top'), 'Processos: top');
  assert.equal(t('Number of DCMs'), 'Número de DCMs');
  assert.equal(t('Example: blinky'), 'Exemplo: blinky');
  // Delete File / Delete Folder into the workspace's .trash (#3364)
  assert.equal(t("Delete 'src/a.vhd'?\n(It is moved to the workspace's .trash folder, from where you can move it back. Remove from Project keeps the file in the project folder.)"),
    "Apagar 'src/a.vhd'?\n(É movido para a pasta .trash da área de trabalho, de onde o pode repor. Remover do Projeto mantém o ficheiro na pasta do projeto.)");
  assert.equal(t("Delete the folder 'old' and the 2 file(s) in it from the project?\n(They are moved to the workspace's .trash folder, from where you can move them back.)\n\nold/a.v\nold/b.v"),
    "Apagar a pasta 'old' e o(s) 2 ficheiro(s) que contém do projeto?\n(São movidos para a pasta .trash da área de trabalho, de onde os pode repor.)\n\nold/a.v\nold/b.v");
  // a task's button with its dot (#991): the task and its state
  assert.equal(t('Implement — done with warnings'), 'Implementar — concluído com avisos');
  assert.equal(t('Design — done, no warnings'), 'Projetar — concluído, sem avisos', 'the Design task: Projetar, a verb as its neighbours (#4953)');
  assert.equal(t('Design'), 'Projeto', 'elsewhere (the Design pane, the console\'s filter): Projeto; the task\'s button says Projetar with data-i18n-task');
  assert.equal(t('Simulate — out of date (a source changed)'), 'Simular — desatualizado (uma fonte mudou)');
  assert.equal(t('Implement — errors'), 'Implementar — erros');
  assert.equal(t('Implement — running…'), 'Implementar — em curso…');
  assert.equal(t('Version 15.5.0'), 'Versão 15.5.0');
  assert.equal(t('SW3 = sw(3) (pin P11) — click to toggle'), 'SW3 = sw(3) (pino P11) — clique para comutar');
  assert.equal(t('Clock clk: 50 MHz on the board · not emulated: vga_red'), 'Relógio clk: 50 MHz na placa · não emulado: vga_red');
  // #1232: a name with $&, $', $` or $$ (a project, a file) comes out as written, its surrounding whitespace kept
  for (const n of ["a$&b", "x$'y", 'p$`q', 'm$$n', '$1'])
    assert.equal(t(`  Reopen ${n} `), `  Reabrir ${n} `, n);
  assert.equal(t("The top-level module 'a$&b' is not in the project."), "O módulo de topo 'a$&b' não está no projeto.");
  assert.equal(t('some text that is not in the dictionary'), 'some text that is not in the dictionary');
  assert.equal(t(''), '');
  assert.equal(t(null), null);
});

// UI labels written as literals in the sources: label: '…', title: '…', field('…', …), headings…; and (#3539) the
// texts of toasts and of the console's messages (#3591), dialogs' titles and messages, plain elements (but those marked data-no-i18n), textContent and the
// errors a dialog's check returns (a sentence)
const LABEL_FORMS = [/\blabel: '([^'$`]+)'/g, /\btitle: '([^'$`]+)'/g, /\bfield\('([^'$`]+)'/g, /\bplaceholder: '([^'$`]+)'/g,
  /\bh\('(?:h2|h3|h4|th|label|button|summary|caption)', \{[^{}]*\}, '([^'$`]+)'\)/g,
  /\btoast\(\s*'([^'$`]+)'/g, /\b(?:log(?:Error|Warning|Info)|message)\(\s*'([^'$`]+)'/g, /\b(?:command(?:Error|Warning|Info)|confirmDlg|promptDlg)\(\s*'([^'$`]+)'/g,
  /\b(?:command(?:Error|Warning|Info)|confirmDlg|promptDlg)\(\s*(?:'[^'$`]*'|[\w.]+),\s*'([^'$`]+)'/g,
  /\bh\('(?:div|p|span|option|b|small|em|strong|li|legend|td)', \{(?![^{}]*no-i18n)[^{}]*\}, '([^'$`]+)'\)/g,
  /\btextContent = '([^'$`]+)'/g, /\breturn '([A-Z][^'$`]* [^'$`]*[.!?…])';/g];
function labelsOf(src, add) {
  for (const re of LABEL_FORMS) for (const m of src.matchAll(re)) add(m[1]);
}
function sourceLabels() {
  const out = new Map();
  for (const f of fs.readdirSync(WEB).filter((x) => x.endsWith('.js') && !/^(i18n|schematic-demo-data|icons)\.js$/.test(x))) {
    const src = fs.readFileSync(path.join(WEB, f), 'utf8');
    labelsOf(src, (s) => { if (/[A-Za-z]{2}/.test(s) && !s.includes('\\')) out.set(s, f); });
  }
  return out;
}

test('#3539 the label scan reaches toasts, dialogs, plain elements, textContent and a dialog\'s returned error', () => {
  const src = `toast('Use Ctrl+V to paste', 'info'); commandError('Rename Folder', 'A folder cannot be moved into itself.');
    confirmDlg('Replace Project',
      'x'); commandWarning(title, 'Select a top-level module first.'); h('option', { value: '' }, '(no board / generic JTAG)');
    h('td', { 'data-no-i18n': '' }, 'integer'); busy.textContent = 'Simulating the current design…';
    if (!to) return 'Enter a file path inside the project.'; return 'sim';`;
  const found = [];
  labelsOf(src, (s) => found.push(s));
  assert.deepEqual(found.sort(), ['(no board / generic JTAG)', 'A folder cannot be moved into itself.', 'Enter a file path inside the project.', 'Rename Folder',
    'Replace Project', 'Select a top-level module first.', 'Simulating the current design…', 'Use Ctrl+V to paste', 'x'].sort());
  // the texts the audit found untranslated (#3539)
  const T = {
    'Select the top module first': 'Selecione primeiro o módulo de topo', 'Simulating the current design…': 'A simular o projeto atual…',
    'Replace Project': 'Substituir Projeto', '(no board / generic JTAG)': '(sem placa / JTAG genérico)', 'Open Project Bundle': 'Abrir Pacote do Projeto',
    'Enter a file path inside the project.': 'Escreva um caminho de ficheiro dentro do projeto.',
    'The module name must start with a letter and contain only letters, digits and _.': 'O nome do módulo tem de começar por uma letra e ter só letras, algarismos e _.',
    'Use Ctrl+V to paste': 'Use Ctrl+V para colar', 'No messages.': 'Sem mensagens.',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
});

test('every UI label in the web/js sources has a Portuguese translation', () => {
  // the same in both languages: names, codes, abbreviations
  const SAME = new Set(['work', 'iMPACT', 'OK', 'MSB', 'LSB', 'Bitstream', 'labels', 'Slew', 'Pull', 'Case', 'Flip-Flops', 'VHDL', 'Verilog', 'ISim', 'Bidir',
    'schematic' /* default architecture name */, 'iMPACT — Boundary Scan', 'Interface' /* the same word in Portuguese */, 'Silinx' /* the Silinx interface: a proper name, #2451 */, 'AMD Vivado' /* a product's name, #1649 */,
    'bypass' /* iMPACT's device in bypass, as ISE writes it */, 'Quine-McCluskey' /* an algorithm's name, #3939 */]);
  const labels = sourceLabels();
  assert.ok(labels.size > 200, `${labels.size} labels found`);
  const missing = [...labels].filter(([s]) => !SAME.has(s) && !/^[^a-z]*$/.test(s) && t(s) === s).map(([s, f]) => `${f}: ${s}`);
  assert.deepEqual(missing, []);
});

test('design checks: the Edit menu item, its messages and the labels of the help (core/hints.js) are translated', async () => {
  assert.equal(t('Design Checks (Lint Warnings)'), 'Verificações do Circuito (Avisos de Lint)');
  for (const s of ['Design checks on: Check Syntax and the editor show the lint warnings', 'Design checks off: only errors are shown']) assert.notEqual(t(s), s, s);
  // the help of the Errors / Warnings tabs is rendered per language (the console pages are not translated by the DOM pass)
  const { HINT_LABELS } = await import('../core/hints.js');
  assert.deepEqual(HINT_LABELS.pt, { explain: 'Explicação', fix: 'Como corrigir', more: 'Explicação e correção' });
});

test('gates (#328): the Inverted inputs field and the XOR2B1 / XOR2B2 descriptions are translated', async () => {
  const { SYMBOLS } = await import('../core/schdoc.js');
  assert.equal(t('Inverted inputs'), 'Entradas invertidas');
  assert.equal(t(SYMBOLS.xor2b1.description), 'Porta XOR de 2 entradas com a entrada I0 invertida (bit a bit quando Largura > 1)');
  assert.equal(t(SYMBOLS.xnor3b2.description), 'Porta XNOR de 3 entradas com as entradas I0 e I1 invertidas (bit a bit quando Largura > 1)');
  // #334: the palette's one MUX, its Select bits
  assert.equal(t(SYMBOLS.mux2.paletteDescription), 'Multiplexador de 2, 4, 8 ou 16 entradas de dados, os bits de seleção (1 a 4), o barramento de seleção e a habilitação nas suas propriedades (bit a bit quando Largura > 1)');
  assert.notEqual(t('Select bits'), 'Select bits');
  assert.notEqual(t(SYMBOLS.demux.description), SYMBOLS.demux.description);
  // #330: the palette's one entry a gate
  assert.equal(t(SYMBOLS.and2.paletteDescription), 'Porta AND de 2, 3 ou 4 entradas, as entradas e as entradas invertidas nas suas propriedades (bit a bit quando Largura > 1)');
  for (const g of ['or2', 'nand2', 'nor2', 'xor2', 'xnor2']) assert.match(t(SYMBOLS[g].paletteDescription), /^Porta X?N?(AND|OR) de 2, 3 ou 4 entradas/);
  assert.equal(t('3-input XNOR gate (bitwise when Width > 1)') !== '3-input XNOR gate (bitwise when Width > 1)', true);
  assert.equal(t('Inputs'), 'Entradas');
  assert.equal(t(SYMBOLS.xor2b2.description), 'Porta XOR de 2 entradas com as entradas I0 e I1 invertidas (bit a bit quando Largura > 1)');
});

test('emulator (#347): the manual clock note is translated', () => {
  assert.equal(t('Manual clock clk (BTN): one edge per press'), 'Relógio manual clk (BTN): um flanco em cada pressão');
  assert.equal(t('Manual clock ck (SW): one edge per press · not emulated: x'), 'Relógio manual ck (SW): um flanco em cada pressão · não emulado: x');
});

test('the wave configuration (#1019): its buttons, dialogs and messages translated', () => {
  assert.deepEqual(['Save Wave Configuration', 'Load Wave Configuration', 'File name in the project:', 'Wave configuration:', 'Load',
    'The project has no wave configuration (.wcfg) yet: save one first.',
    "'a b' is not a valid file name (letters, digits, _ . - and folders; .wcfg).", 'sim/tb.wcfg already exists. Overwrite it?'].map(t),
  ['Guardar Configuração de Formas de Onda', 'Carregar Configuração de Formas de Onda', 'Nome do ficheiro no projeto:', 'Configuração de formas de onda:', 'Carregar',
    'O projeto ainda não tem configurações de formas de onda (.wcfg): guarde uma primeiro.',
    "'a b' não é um nome de ficheiro válido (letras, algarismos, _ . - e pastas; .wcfg).", 'sim/tb.wcfg já existe. Substituí-lo?']);
});

// #5223: the simulation's application lines in Portuguese: SSim's wave configuration's, as mountWcfg writes them (app
// lines, their English kept), the other lines of SSim's window, the Test Bench Wizard's and Set as Top Module's
test('#5223 the simulation\'s application lines: the wave configuration\'s (as SSim writes them), its runs\', forces\', stimuli\'s, the Test Bench Wizard\'s', async () => {
  await import('./ui/core-hooks.js');
  const { mountWcfg } = await import('../web/js/isim-wcfg.js');
  const sig = (name, w) => ({ name, path: `tb.${name}`, scope: 'tb', t: { kind: 'logic', w } });
  const signals = [sig('clk', 1), sig('q', 4)];
  const st = { rows: [], sel: new Set(), markers: [], rowSeq: 0, markerSeq: 0 };
  const said = [];
  let saveErr = null;
  const opts = { wcfg: { save: async () => { if (saveErr) throw new Error(saveErr); return 'sim/tb_counter.wcfg'; }, load: async () => ({ name: 'bad.wcfg', text: '{}' }) } };
  const w = mountWcfg({ opts, st, design: { top: { name: 'tb' }, signals }, newRow: (s, o) => ({ id: st.rowSeq++, kind: 'sig', sig: s, ...o }),
    rebuildFlat() {}, invalidate() {}, logLine: (text, kind, o) => said.push([text, kind, o?.app === true]) });
  st.rows = signals.map((s) => ({ id: st.rowSeq++, kind: 'sig', sig: s }));
  st.markers = [{ id: 0, t: 1000 }];
  await w.saveWcfg();
  const text = w.wcfgText();
  w.applyWcfg(text, 'sim/tb_counter.wcfg');
  w.applyWcfg(text.replace('/tb/clk', '/tb/gone'), 'other.wcfg');
  await w.loadWcfg();
  saveErr = 'disk full';
  await w.saveWcfg();
  assert.deepEqual(said, [
    ['Wave configuration saved to sim/tb_counter.wcfg', 'info', true],
    ['Wave configuration sim/tb_counter.wcfg loaded: 2 signals, 1 marker', 'info', true],
    ['WARNING: /tb/gone is not a signal of this design: not shown', 'warning', true],
    ['Wave configuration other.wcfg loaded: 1 signal, 1 marker', 'info', true],
    ['ERROR: the wave configuration was not loaded: not a wave configuration (no <wave_config>)', 'error', true],
    ['ERROR: the wave configuration was not saved: disk full', 'error', true],
  ]);
  // (drawn as SSim's console draws an application's line: its tag kept, web/js/isim-console.js)
  const drawn = (l) => { const m = /^((?:ERROR|WARNING): )(.*)$/s.exec(l); return m ? m[1] + t(m[2]) : t(l); };
  assert.deepEqual(said.map(([l]) => drawn(l)), [
    'Configuração de formas de onda guardada em sim/tb_counter.wcfg',
    'Configuração de formas de onda sim/tb_counter.wcfg carregada: 2 sinais, 1 marcador',
    'WARNING: /tb/gone não é um sinal deste projeto: não mostrado',
    'Configuração de formas de onda other.wcfg carregada: 1 sinal, 1 marcador',
    'ERROR: a configuração de formas de onda não foi carregada: not a wave configuration (no <wave_config>)',
    'ERROR: a configuração de formas de onda não foi guardada: disk full',
  ]);
  assert.equal(t('Wave configuration sim/tb_counter.wcfg loaded: 6 signals, 3 markers'), 'Configuração de formas de onda sim/tb_counter.wcfg carregada: 6 sinais, 3 marcadores');
  // SSim's other application lines (web/js/isim-api.js, isim-forces.js, isim-run.js, isim-stimuli.js, isim-toolbar.js)
  assert.deepEqual(['2 force(s) re-applied.', 'Force removed from /tb/clk', 'simulation has finished; the force takes effect after restart',
    "Command 'run 1 us' cancelled (Break)", 'Simulation has already finished ($finish); use Restart to run again.', 'internal simulator error: x',
    'Simulation interrupted (Break) at 10 ns', 'Simulation stopped: no more events scheduled (time 7 ns)', 'Run All stopped at the 1 ms limit (time 1 ms)',
    'Simulation has finished; use Restart.', 'No more events scheduled', 'Stepped to 5 ns', "invalid run time 'x ns'",
    'Stimuli: 32 cycles, the expected outputs match', 'Stimuli: 1 mismatch(es) of the expected outputs', '  y at cycle 0 (0 ns): expected 1, got 0',
    'Stimuli: the expected outputs filled in from the simulation', 'Waveform exported to tb.vcd (1.2 KB)', 'VCD export failed: x'].map(t),
  ['2 forçamento(s) aplicado(s) de novo.', 'Forçamento removido de /tb/clk', 'a simulação terminou; o forçamento tem efeito depois de reiniciar',
    "Comando 'run 1 us' cancelado (Parar)", 'A simulação já terminou ($finish); use Reiniciar para a executar de novo.', 'erro interno do simulador: x',
    'Simulação interrompida (Parar) em 10 ns', 'Simulação parada: não há mais eventos agendados (tempo 7 ns)', 'Executar Tudo parado no limite de 1 ms (tempo 1 ms)',
    'A simulação terminou; use Reiniciar.', 'Não há mais eventos agendados', 'Avançou para 5 ns', "tempo de execução inválido 'x ns'",
    'Estímulos: 32 ciclos, as saídas esperadas coincidem', 'Estímulos: 1 diferença(s) nas saídas esperadas', '  y no ciclo 0 (0 ns): esperado 1, obtido 0',
    'Estímulos: as saídas esperadas preenchidas a partir da simulação', 'Formas de onda exportadas para tb.vcd (1.2 KB)', 'a exportação VCD falhou: x']);
  // the Console's: the Test Bench Wizard's (web/js/tbwizard.js: a project's, a design and simulation project's, a skeleton) and Set as Top Module's
  assert.deepEqual([
    "Test Bench Wizard: created sim/tb_counter.vhd (16 vector(s)) for 'counter' (selected in the Simulation view). Run Simulate Behavioral Model to check the design.",
    "Test Bench Wizard: created the test bench tb_counter (16 vector(s)) for 'counter' (selected in the Simulation view). Run Simulate Behavioral Model to check the design.",
    "Test Bench Wizard: created the test bench skeleton sim/tb_counter.v for 'counter' (selected in the Simulation view): write the stimulus, then Simulate Behavioral Model.",
    "Top-level simulation module set to 'tb_counter'.", "Top-level module set to 'counter'."].map(t), [
    "Assistente de Bancada de Teste: criou sim/tb_counter.vhd (16 vetor(es)) para 'counter' (selecionada na vista Simulação). Execute Simular Modelo Comportamental para verificar o projeto.",
    "Assistente de Bancada de Teste: criou a bancada de teste tb_counter (16 vetor(es)) para 'counter' (selecionada na vista Simulação). Execute Simular Modelo Comportamental para verificar o projeto.",
    "Assistente de Bancada de Teste: criou o esqueleto da bancada de teste sim/tb_counter.v para 'counter' (selecionada na vista Simulação): escreva os estímulos e depois Simular Modelo Comportamental.",
    "Módulo de topo da simulação definido como 'tb_counter'.", "Módulo de topo definido como 'counter'."]);
});

// #5254: the project's lifecycle's application lines in Portuguese (appLog: their English kept, drawn through t()): a
// project opened, New Source, a drawing's HDL made, Remove from Project, Undo / Redo, Rename (core/rename-module.js's),
// Export, Import (its counts, either form, #5253), the wizards' sources
test('#5254 the project\'s lines: opened, New Source, the HDL made, Remove, Undo / Redo, Rename, Export, Import, the wizards\'', () => {
  assert.deepEqual([
    'Project "UsabLife" opened (xc3s250e-4-cp132).', 'Project "d" opened (a design and simulation project, no FPGA).',
    "Created Module (HDL) (VHDL) 'src/alu.vhd'.", "Created Schematic 'src/sheet.sch.json'.", "Created Memory Initialization File (.mem) 'src/rom.mem'.",
    "Created Test Bench (Verilog) 'sim/tb_alu.v'.", "Created Clock Manager (DCM / PLL) 'src/c.vhd'.",
    'src/sheet.vhd generated from src/sheet.sch.json (every source has its HDL)',
    'src/sheet.vhd generated from src/sheet.sch.json (its HDL file src/old.vhd was removed from the project)',
    'src/sheet.vhd generated from src/sheet.sch.json (its HDL file src/old.vhd is no longer in the project folder)',
    'src/sheet_1.vhd generated from src/sheet.sch.json (src/sheet.vhd holds something else)', 'src/x.vhd replaced by the HDL generated from src/x.sch.json, linked to it',
    'src/x.vhd generated again from src/x.sch.json, back in the project', 'src/x.vhd updated from src/x.sch.json',
    'Removed src/net.pn.json and its HDL file src/net.vhd from the project (the files are kept in the project folder).',
    'Removed src/alu.vhd from the project (the file is kept in the project folder).',
    'Undo: Remove from Project.', 'Redo: Rename.',
    "Rename: module 'alu' renamed to 'alu2' (2 file(s) updated); src/alu.vhd → src/alu2.vhd.", 'Rename: src/a.mem → src/b.mem.', 'Rename: nothing to rename.',
    'Exported UsabLife-silinx.zip: the whole Silinx project (silinx.json + all project files, 12 KB).',
    'Exported UsabLife-ise.zip: Xilinx ISE project UsabLife.xise + its sources (9 KB).',
    "Imported Silinx project 'UsabLife2' (8 source file(s), 3 other file(s)).", "Imported Silinx project 'p' (3 source file(s)).",
    "Imported Xilinx ISE project 'lab' (4 source file(s), 1 other file(s)).", "Importing folder 'lab': 12 file(s), 3 build/hidden file(s) skipped.",
    'files listed in silinx.json but not in the zip: src/a.vhd', 'files referenced by the .xise but not found: a.vhd, b.vhd',
    'Clocking Wizard: created src/clkgen.vhd, the module clkgen: clk0 50 MHz.', 'Clocking Wizard: wrote again src/clkgen.vhd, the module clkgen: clk0 50 MHz, clk1 25 MHz.',
    'Block Memory: created src/ram.vhd, the module ram: 1024 x 8, 1 RAMB16_S9.', 'Block Memory: wrote again src/ram.v, the module ram: 16 x 4, inferable HDL.',
    'Module Wizard: created src/m.vhd (VHDL, sequential). Fill in the TODO comments with the logic.', 'Schematic Wizard: created src/s.sch.json with 3 I/O marker(s).',
    'FSM Wizard: created src/f.fsm.json with 1 input(s), 2 output(s) and 4 state(s).', 'Petri Net Wizard: created src/p.pn.json with 2 input(s) and 1 output(s).',
    'Boolean Algebra Wizard: created src/b.bool.json with 3 input(s) and 2 output(s).', 'UCF Wizard: created constraints/top.ucf for \'top\', 5 net(s) on pins.',
    "Save as Test Bench: created sim/tb_m.vhd from the stimuli of 'm' (8 cycle(s)); run Simulate Behavioral Model on tb_m to check the design.",
  ].map(t), [
    'Projeto "UsabLife" aberto (xc3s250e-4-cp132).', 'Projeto "d" aberto (um projeto de desenho e simulação, sem FPGA).',
    "Nova fonte criada: Módulo (HDL) (VHDL) 'src/alu.vhd'.", "Nova fonte criada: Esquemático 'src/sheet.sch.json'.", "Nova fonte criada: Ficheiro de Inicialização de Memória (.mem) 'src/rom.mem'.",
    "Nova fonte criada: Bancada de Teste (Verilog) 'sim/tb_alu.v'.", "Nova fonte criada: Gestor de Relógio (DCM / PLL) 'src/c.vhd'.",
    'src/sheet.vhd gerado a partir de src/sheet.sch.json (todas as fontes têm o seu HDL)',
    'src/sheet.vhd gerado a partir de src/sheet.sch.json (o seu ficheiro HDL src/old.vhd foi removido do projeto)',
    'src/sheet.vhd gerado a partir de src/sheet.sch.json (o seu ficheiro HDL src/old.vhd já não está na pasta do projeto)',
    'src/sheet_1.vhd gerado a partir de src/sheet.sch.json (src/sheet.vhd contém outra coisa)', 'src/x.vhd substituído pelo HDL gerado a partir de src/x.sch.json, ligado a ele',
    'src/x.vhd gerado de novo a partir de src/x.sch.json, de volta ao projeto', 'src/x.vhd atualizado a partir de src/x.sch.json',
    'Removidos do projeto src/net.pn.json e o seu ficheiro HDL src/net.vhd (os ficheiros ficam na pasta do projeto).',
    'Removido src/alu.vhd do projeto (o ficheiro fica na pasta do projeto).',
    'Anular: Remover do Projeto.', 'Refazer: Mudar o Nome.',
    "Mudar o Nome: módulo 'alu' passou a chamar-se 'alu2' (2 ficheiro(s) atualizado(s)); src/alu.vhd → src/alu2.vhd.", 'Mudar o Nome: src/a.mem → src/b.mem.', 'Mudar o Nome: nada a mudar.',
    'Exportado UsabLife-silinx.zip: o projeto Silinx inteiro (silinx.json + todos os ficheiros do projeto, 12 KB).',
    'Exportado UsabLife-ise.zip: o projeto Xilinx ISE UsabLife.xise + as suas fontes (9 KB).',
    "Importado o projeto Silinx 'UsabLife2' (8 ficheiro(s) de fonte, 3 outro(s) ficheiro(s)).", "Importado o projeto Silinx 'p' (3 ficheiro(s) de fonte).",
    "Importado o projeto Xilinx ISE 'lab' (4 ficheiro(s) de fonte, 1 outro(s) ficheiro(s)).", "A importar a pasta 'lab': 12 ficheiro(s), 3 ficheiro(s) gerado(s)/oculto(s) ignorado(s).",
    'ficheiros listados em silinx.json mas não no zip: src/a.vhd', 'ficheiros referidos pelo .xise mas não encontrados: a.vhd, b.vhd',
    'Assistente de Relógio: criou src/clkgen.vhd, o módulo clkgen: clk0 50 MHz.', 'Assistente de Relógio: reescreveu src/clkgen.vhd, o módulo clkgen: clk0 50 MHz, clk1 25 MHz.',
    'Memória de Bloco: criou src/ram.vhd, o módulo ram: 1024 x 8, 1 RAMB16_S9.', 'Memória de Bloco: reescreveu src/ram.v, o módulo ram: 16 x 4, HDL inferível.',
    'Assistente de Módulo: criou src/m.vhd (VHDL, sequencial). Preencha os comentários TODO com a lógica.', 'Assistente de Esquemático: criou src/s.sch.json com 3 marcador(es) de E/S.',
    'Assistente de FSM: criou src/f.fsm.json com 1 entrada(s), 2 saída(s) e 4 estado(s).', 'Assistente de Rede de Petri: criou src/p.pn.json com 2 entrada(s) e 1 saída(s).',
    'Assistente de Álgebra Booleana: criou src/b.bool.json com 3 entrada(s) e 2 saída(s).', "Assistente de UCF: criou constraints/top.ucf para 'top', 5 rede(s) em pinos.",
    "Guardar como Bancada de Teste: criou sim/tb_m.vhd a partir dos estímulos de 'm' (8 ciclo(s)); execute Simular Modelo Comportamental em tb_m para verificar o projeto.",
  ]);
  // (a folder's import: its missing files)
  assert.equal(t('files listed in silinx.json but not in the folder: x.vhd'), 'ficheiros listados em silinx.json mas não na pasta: x.vhd');
});

test('SSim (#920): the simulator\'s labels translated with its name, SSim; no label of it says ISim', () => {
  assert.deepEqual(['SSim Simulator', 'Type an SSim command (help)', 'SSim (VHDL/Verilog; Silinx Simulator)'].map(t),
    ['Simulador SSim', 'Escreva um comando do SSim (help)', 'SSim (VHDL/Verilog; Simulador Silinx)']);
  // (ISim, Xilinx's simulator, only in the trademark notice)
  const isim = [...sourceLabels()].map(([s]) => s).filter((s) => /\bISim\b/.test(s) && !/trademarks of AMD/.test(s));
  assert.deepEqual(isim, []);
});

test('the Development menu\'s Pen and Touch Test (#1054): its labels, its states and Silinx\'s actions translated; the report in English', async () => {
  // every capitalised text of web/js/devmenu-pointer.js but the report's (English, pasted into an issue) and the name
  const src = fs.readFileSync(path.join(WEB, 'devmenu-pointer.js'), 'utf8');
  const texts = [...new Set([...src.matchAll(/'([A-Z][^'$`]*[a-z][^'$`]*)'/g)].map((m) => m[1]))].filter((s) => !['Silinx', 'Silinx: pen and touch test'].includes(s));
  assert.ok(texts.length >= 20, texts.join(', '));
  assert.deepEqual(texts.filter((s) => t(s) === s), []);
  assert.equal(t('Pen and Touch Test…'), 'Teste de Caneta e Toque…');
  assert.equal(t('Two-finger pan and zoom'), 'Deslocar e ampliar com dois dedos');
  assert.equal(t('Pointers down at once: 2 (most: 3)'), 'Ponteiros premidos ao mesmo tempo: 2 (máximo: 3)');
});

test('the handwritten input (#1056): the texts of its modules and the recognizer\'s messages are translated', async () => {
  // the literals of the dialog and the pad: texts of elements, messages, titles (besides the labels checked above)
  const missing = [];
  let n = 0;
  for (const f of ['ink-dialog.js', 'ink-pad.js', 'ink-table-dialog.js', 'ink-schematic-dialog.js', 'sch-ink.js', 'ink-drawing.js']) {
    const src = fs.readFileSync(path.join(WEB, f), 'utf8');
    for (const m of src.matchAll(/(?:\}, |textContent = |showMsg\(\[|return )(['"])((?:(?!\1).)*[a-z]{2}(?:(?!\1).)*)\1/g)) { n++; if (t(m[2]) === m[2]) missing.push(`${f}: ${m[2]}`); }
  }
  assert.deepEqual(missing, []);
  assert.ok(n >= 12, `${n} texts`);
  const T = {
    'Samples of your handwriting: 3': 'Amostras da sua letra: 3', "Sample of 'A' saved.": "Amostra de 'A' guardada.",
    'Type one symbol of the set: A B C': 'Escreva um símbolo do conjunto: A B C',
    'A symbol was not recognized (shown as ?): write it again, or teach Silinx your handwriting.': 'Um símbolo não foi reconhecido (mostrado como ?): escreva-o de novo, ou ensine ao Silinx a sua letra.',
    '2 symbols were not recognized (shown as ?): write them again, or teach Silinx your handwriting.': '2 símbolos não foram reconhecidos (mostrados como ?): escreva-os de novo, ou ensine ao Silinx a sua letra.',
    "More than one '=': only the first one separates the name from the expression.": "Mais de um '=': só o primeiro separa o nome da expressão.",
    'Nothing written: write the expression on the pad.': 'Nada escrito: escreva a expressão na área de escrita.',
    'Expression: 1 to 6 inputs (it has 7).': 'Expressão: 1 a 6 entradas (tem 7).', "Expression: 'F-1' is not a valid output name.": "Expressão: 'F-1' não é um nome de saída válido.",
    "Expression: the output 'a' is also an input.": "Expressão: a saída 'a' é também uma entrada.", "Expression: unexpected '+' (at position 3)": "Expressão: unexpected '+' (at position 3)",
    'Handwritten Algebra…': 'Álgebra Manuscrita…', 'Algebra from Module…': 'Álgebra de um Módulo…', 'The output F has two expressions.': 'A saída F tem duas expressões.',
    'F is both an output and an input: an expression of the inputs only.': 'F é uma saída e uma entrada: uma expressão só das entradas.',
    '7 inputs (A, B, C, D, E, G, H): at most 6.': '7 entradas (A, B, C, D, E, G, H): no máximo 6.',
    'Handwritten Expression': 'Expressão Manuscrita', 'Teach Silinx my handwriting': 'Ensinar ao Silinx a minha letra',
    // the truth tables drawn by hand (#1066)
    'Handwritten Boolean Algebra…': 'Álgebra Booleana Manuscrita…', 'Handwritten Schematic…': 'Esquemático Manuscrito…', 'Header: two names over column 2 (A, B).': 'Cabeçalho: dois nomes sobre a coluna 2 (A, B).',
    'Row 3, column 1: no value.': 'Linha 3, coluna 1: sem valor.', 'Row 3, column 1: 2 symbols.': 'Linha 3, coluna 1: 2 símbolos.',
    'Column 3 has no name: out1.': 'A coluna 3 não tem nome: out1.', "Line 1: '1b' is not a name.": "Linha 1: '1b' não é um nome.",
    "Line 1: 'A' is named twice.": "Linha 1: 'A' aparece duas vezes.", '1 to 6 inputs (the table has 7).': '1 a 6 entradas (a tabela tem 7).',
    'Line 2: 2 values, 3 expected.': 'Linha 2: 2 valores, 3 esperados.', "Line 2: an input is 'X': only 0 or 1.": "Linha 2: uma entrada é 'X': só 0 ou 1.",
    "Line 2: an output is '?': only 0, 1 or X.": "Linha 2: uma saída é '?': só 0, 1 ou X.", 'Lines 2 and 3: the inputs 01 with other outputs.': 'Linhas 2 e 3: as entradas 01 com outras saídas.',
    'Line 3 repeats line 2.': 'A linha 3 repete a linha 2.', 'Not in the table: 00, 01 (their outputs are 0).': 'Fora da tabela: 00, 01 (as suas saídas são 0).',
    'Not in the table: 0001, 0010 and 7 more (their outputs are 0).': 'Fora da tabela: 0001, 0010 e mais 7 (as suas saídas são 0).',
    // the schematics drawn by hand (#1067)
    'Two gate outputs are joined (U1, U2).': 'Duas saídas de portas estão ligadas (U1, U2).', 'U2 (NOR): no wire from its output.': 'U2 (NOR): nenhum fio sai da sua saída.',
    'U3 (NOT): 2 inputs, 1 expected.': 'U3 (NOT): 2 entrada(s), 1 esperada.', 'U1 (AND): 1 input, 2 to 5 expected.': 'U1 (AND): 1 entrada(s), 2 a 5 esperadas.',
    'Two names on one net: A, B.': 'Dois nomes numa só rede: A, B.', 'The output of U2 has no name: out1.': 'A saída de U2 não tem nome: out1.',
    "A wire to U1 starts at no output and no name: write the input's name at its end.": 'Um fio para U1 não começa numa saída nem num nome: escreva o nome da entrada na sua ponta.',
    "'_F' is not a name: correct it.": "'_F' não é um nome: corrija-o.", 'The name A is on two nets.': 'O nome A está em duas redes.',
    "The name Q is at no wire's end.": 'O nome Q não está na ponta de nenhum fio.', '3 wire ends touch nothing.': '3 pontas de fios não tocam em nada.',
    'A wire of F could not be routed clear of the others: check it.': 'Um fio de F não pôde ser traçado livre dos outros: verifique-o.',
    "A wire of U2's output could not be routed clear of the others: check it.": 'Um fio da saída de U2 não pôde ser traçado livre dos outros: verifique-o.',
    // a drawing kept (#1749)
    'This is a drawing of a schematic, not of an expression.': 'É um desenho de um esquemático, não de uma expressão.',
    'A Silinx drawing of version 2: this Silinx reads version 1.': 'Um desenho do Silinx da versão 2: este Silinx lê a versão 1.',
    "A Silinx drawing of an unknown kind: 'fsm'.": "Um desenho do Silinx de um tipo desconhecido: 'fsm'.",
    // the flip-flops drawn by hand (#1083)
    "U1 (flip-flop): 'X' is not one of its pins (D, T, J, K, C, CE, CLR, PRE, R, S; Q, Q̄).": "U1 (flip-flop): 'X' não é um dos seus pinos (D, T, J, K, C, CE, CLR, PRE, R, S; Q, Q̄).",
    'U1 (flip-flop): two wires to D.': 'U1 (flip-flop): dois fios para D.', 'U2 (flip-flop): no wire to C.': 'U2 (flip-flop): nenhum fio para C.',
    'U1 (flip-flop): no wire from its outputs.': 'U1 (flip-flop): nenhum fio sai das suas saídas.',
    'U1 (flip-flop): no data input: write D, T, or J and K.': 'U1 (flip-flop): nenhuma entrada de dados: escreva D, T, ou J e K.',
    'U1 (flip-flop): no clock: write C or CLK, or draw a wedge.': 'U1 (flip-flop): nenhum relógio: escreva C ou CLK, ou desenhe uma cunha.',
    'U1 (flip-flop): no flip-flop of the library has the inputs J, K, C, R.': 'U1 (flip-flop): nenhum flip-flop da biblioteca tem as entradas J, K, C, R.',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
  // the recognizer's own messages, as it writes them
  const { recognizeExpression, InkError } = await import('../core/ink/expression.js');
  assert.throws(() => recognizeExpression([]), (e) => e instanceof InkError && t(e.message) !== e.message);
  const { readSchematic } = await import('../core/ink/schematic.js');
  assert.throws(() => readSchematic([]), (e) => e instanceof InkError && t(e.message) !== e.message);
  const { readTable, tableFromText } = await import('../core/ink/table.js');
  assert.throws(() => readTable([]), (e) => e instanceof InkError && t(e.message) !== e.message);
  for (const text of ['', 'a b f', '| f', 'a |', 'a b | f\n1 1 | 1\n1 1 | 1']) for (const m of [...tableFromText(text).errors, ...tableFromText(text).warnings]) assert.notEqual(t(m), m, m);
});

test('ISim groups (#341): the menu items and the prompt are translated', () => {
  assert.deepEqual(['New Group', 'Rename Group...', 'Ungroup', 'Group name:'].map(t), ['Novo Grupo', 'Mudar Nome do Grupo...', 'Desagrupar', 'Nome do grupo:']);
});

test('ISim stimuli (#336): the bar, the dialogs, the status, the errors and Save as Test Bench are translated', () => {
  for (const [en, pt] of [
    ['Fill Expected Outputs', 'Preencher Saídas Esperadas'], ['Save as Test Bench…', 'Guardar como Bancada de Teste…'], ['Stimulus Timing', 'Temporização dos Estímulos'],
    ['None (combinational)', 'Nenhum (combinatório)'], ['Test bench name:', 'Nome da bancada de teste:'],
    ['8 cycles (clock clk, period 20 ns): 2 mismatch(es)', '8 ciclos (relógio clk, período 20 ns): 2 diferença(s)'],
    ['16 cycles (combinational, step 10 ns): no expected outputs', '16 ciclos (combinatório, passo 10 ns): sem saídas esperadas'],
    ['4 cycles (clock ck, period 8 ns): expected outputs OK', '4 ciclos (relógio ck, período 8 ns): saídas esperadas certas'],
    ['Cycles: a whole number of at least 1', 'Ciclos: um número inteiro de pelo menos 1'],
    ["'2q' is not a value (bits 0 1 Z X, h… hexadecimal or d… decimal)", "'2q' não é um valor (bits 0 1 Z X, h… hexadecimal ou d… decimal)"],
    ["'h1F' does not fit in 4 bit(s)", "'h1F' não cabe em 4 bit(s)"],
  ]) assert.equal(t(en), pt);
  assert.equal(t('The inputs of ctr as a grid of cycles: with a clock, the inputs change at its falling edge and the outputs are checked before the next one; without one, they change at every cycle, one for each combination of the inputs.'),
    'As entradas de ctr como uma grelha de ciclos: com relógio, as entradas mudam no seu flanco descendente e as saídas são verificadas antes do seguinte; sem relógio, mudam a cada ciclo, um por cada combinação das entradas.');
});

test('tri-state buffers: the palette category, parameter labels and the descriptions of TBUF and every preset are translated', async () => {
  const { SYMBOLS } = await import('../core/schdoc.js');
  const S = SYMBOLS.tbuf;
  assert.equal(t('Buffers'), 'Buffers');
  assert.equal(t('Buffers (3)'), 'Buffers (3)');
  for (const p of S.params) assert.notEqual(t(p.label), p.label, p.label);
  assert.equal(t('Enable input'), 'Entrada de habilitação');
  for (const d of [S.description, ...S.presets.map(p => p.description)]) {
    const v = t(d);
    assert.notEqual(v, d, d);
    assert.match(v, /três estados/);
  }
  // (#326: BUFE and BUFT only, their Width and Pins per bit making BUFT8, BUFE4…)
  assert.deepEqual(S.presets.map(p => p.title), ['BUFE', 'BUFT']);
  assert.equal(t(S.presets.find(p => p.title === 'BUFT').description), 'Buffer de três estados, habilitação T ativa a 0: O = I quando T = 0, Z quando T = 1');
  assert.equal(t('Pins per bit (I0.., O0..)'), 'Um pino por bit (I0.., O0..)');
});

test('schematic editor and its RTL / Technology views (#130): every symbol description, parameter and option, the texts of web/js/sch-editor.js and its parts', async () => {
  const { SYMBOLS } = await import('../core/schdoc.js');
  // the same in Portuguese: Buffer, Reset, one-hot, INIT, the comparison operators
  const SAME = new Set(['Buffer', 'Reset', 'one-hot', 'INIT', 'eq', 'ne', 'lt', 'le', 'gt', 'ge']);
  const missing = [];
  const check = (s, what) => { if (/[A-Za-z]{2}/.test(s || '') && !SAME.has(s) && t(s) === s) missing.push(`${what}: ${s}`); };
  for (const [type, S] of Object.entries(SYMBOLS)) {
    check(S.description, type);
    for (const p of S.presets || []) check(p.description, `${type} ${p.title}`);
    // (a device primitive's attributes, #791: their UNISIM names and values, as the HDL writes them)
    for (const p of S.params || []) if (!p.attr) { check(p.label, `${type} parameter`); for (const o of p.options || []) check(Array.isArray(o) ? o[1] : o, `${type} option`); }
  }
  // text: '…' literals of the editor (captions, panel titles, options), besides the labels checked above; the editor's
  // parts in modules of their own (#405) too
  // (the editor's labels: in its parts too since #405)
  for (const f of ['sch-editor.js', 'sch-props.js', 'sch-multi.js', 'sch-modsym.js', 'sch-tools.js', 'sch-palette.js', 'sch-toolbar.js', 'sch-try.js', 'sch-rename.js', 'sch-compare.js', 'sch-join.js']) {
    const src = fs.readFileSync(path.join(WEB, f), 'utf8');
    for (const m of src.matchAll(/\btext: '([^'$`]+)'/g)) if (/[a-z]{2}/.test(m[1]) && !['labels', 'Verilog', 'schematic'].includes(m[1])) check(m[1], f);
  }
  assert.deepEqual(missing, []);
  // exact translations: palette, tooltips, properties, the status bar
  const T = {
    '<--All Symbols-->': '<--Todos os Símbolos-->', Properties: 'Propriedades', Symbols: 'Símbolos', Categories: 'Categorias', Parameters: 'Parâmetros',
    Inverter: 'Inversor', '2-input AND gate (bitwise when Width > 1)': 'Porta AND de 2 entradas (bit a bit quando Largura > 1)',
    '5-input NOR gate (bitwise when Width > 1)': 'Porta NOR de 5 entradas (bit a bit quando Largura > 1)',
    'Module lut4': 'Módulo lut4', 'Module Blink_Ctrl': 'Módulo Blink_Ctrl', 'Pins (5)': 'Pinos (5)', 'Wire · net clk': 'Fio · rede clk',
    "Net 'clk', 1 bit": "Rede 'clk', 1 bit", "Net 'leds', 8 bits": "Rede 'leds', 8 bits", 'VHDL statements (emitted verbatim)': 'Instruções VHDL (copiadas tal e qual)',
    '2 objects selected': '2 objetos selecionados', '1 symbol, 3 nets': '1 símbolo, 3 redes', '12 symbols, 30 nets': '12 símbolos, 30 redes',
    '3 ports · VHDL · src/knight.vhd': '3 portos · VHDL · src/knight.vhd', '1 ports': '1 porto',
    'Open top.vhd': 'Abrir top.vhd', 'Open pong.v': 'Abrir pong.v', 'Drawing Technology schematic of top…': 'A desenhar o esquemático tecnológico de top…',
    'Drawing RTL schematic of knight…': 'A desenhar o esquemático RTL de knight…', '(mixed)': '(vários)',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
  // not a source file: unchanged
  assert.equal(t('Open file'), 'Abrir ficheiro');
  assert.equal(t('Open the project'), 'Open the project');
});

test('#1024 Program FPGA with no programming file, or one older than the sources: the question in Portuguese', async () => {
  const { implementFirstText } = await import('../web/js/impact-file.js');
  const T = {
    "There is no programming file of 'top' yet.": "Ainda não há ficheiro de programação de 'top'.",
    "The programming file of 'counter_top' is older than the sources.": "O ficheiro de programação de 'counter_top' é mais antigo do que as fontes.",
    "The last implementation of 'top' failed.": "A última implementação de 'top' falhou.",
    'Implement the design first? When it ends without errors, the FPGA is programmed.': 'Implementar o projeto primeiro? Quando terminar sem erros, a FPGA é programada.',
    'The design is being implemented: program it when it ends': 'O projeto está a ser implementado: programe-o quando terminar',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
  // every line the question can have
  for (const st of ['none', 'stale', 'err']) for (const l of implementFirstText(st, 'top')) assert.notEqual(t(l), l, l);
  // the lines of the Tasks interface's Program that #1024 removed: no longer translated
  for (const s of ['Up to date with the sources', 'No programming file yet']) assert.equal(PT[s], undefined, s);
});

// #1405: every key of the Portuguese dictionary is a text of the sources (a string or template literal of web/, core/,
// server/ or the toolchain's package, #1973, or a page's), or a text a template of theirs makes (each ${…} any text: `Simulate ${name} Model`); a key the
// interface no longer has fails here (it is removed with its label)
test('#1405 every Portuguese translation is of a text the sources still have', () => {
  const ROOT = path.join(WEB, '..', '..');
  const tracked = execSync('git ls-files web core server packages/silinx-fpga/src packages/silinx-hdl/src', { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const texts = new Set(), made = [];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const f of tracked.filter((x) => /\.m?js$/.test(x) && !/^web\/js\/i18n[^/]*\.js$/.test(x))) {
    const { strings, templates } = literalsOf(read(f));
    for (const s of strings) texts.add(s);
    for (const parts of templates) {
      if (parts.length === 1) texts.add(parts[0]);
      else if (parts.join('').trim().length >= 4) made.push(new RegExp(`^${parts.map(esc).join('[\\s\\S]*?')}$`));
    }
  }
  // (a text written in pieces: 'a ' + 'b', its quotes escaped in them: \' and \")
  const joined = tracked.filter((x) => /\.(m?js|html)$/.test(x) && !/^web\/js\/i18n[^/]*\.js$/.test(x)).map(read).join('\n').replace(/(['"`])\s*\+\s*(['"`])/g, '').replace(/\\(['"`])/g, '$1');
  const unused = Object.keys(PT.strings).filter((k) => !texts.has(k) && !joined.includes(k) && !made.some((re) => re.test(k)));
  assert.deepEqual(unused, [], 'translations of texts no source has: remove them from web/js/i18n*.js');
});

test('#1405 literalsOf: strings, a template\'s parts, comments and regular expressions skipped', () => {
  const src = "const a = 'x\\'y'; // 'not this'\n/* 'nor this' */ const r = /'[^']*'/g; const t = `Open ${f(`in ${n}`)} now`; return /a`b/.test(\"z\");";
  const { strings, templates } = literalsOf(src);
  assert.deepEqual(strings, ["x'y", 'z']);
  assert.deepEqual(templates, [['in ', ''], ['Open ', ' now']]);
});

test('#2082 the FSM, ASM and UCF wizards\' messages in Portuguese', () => {
  const T = {
    'Wizard >': 'Assistente >',
    "'x' is used twice (the clock and input)": "'x' é usado duas vezes (o relógio e entrada)",
    "'rst' is used twice (the reset and output)": "'rst' é usado duas vezes (o reset e saída)",
    "Two states are named 'idle'.": "Há dois estados com o nome 'idle'.",
    'Not assigned: s[2..].': 'Por atribuir: s[2..].',
    'The pin P11 is given to a and s<0>.': 'O pino P11 está dado a a e a s<0>.',
    "The wizard will create constraints/pins.ucf, the project's constraints file:": 'O assistente vai criar constraints/pins.ucf, o ficheiro de restrições do projeto:',
    'The wizard will create constraints/more.ucf:': 'O assistente vai criar constraints/more.ucf:',
    'Each bit of the module\'s ports on a pin of the Digilent Basys2: assigned from the board by their names (clk, led, sw, btn…) and directions; change them at will.':
      'Cada bit dos portos do módulo num pino da Digilent Basys2: atribuído pela placa pelos nomes (clk, led, sw, btn…) e pelas direções; mude-os à vontade.',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
  // the old label of the button: gone with it
  assert.equal(PT.strings.Wizard, undefined);
});

test('#2296 the PCF, LPF and CST wizards\' names and refusals in Portuguese', () => {
  const T = {
    'PCF Wizard': 'Assistente de PCF', 'LPF Wizard': 'Assistente de LPF', 'CST Wizard': 'Assistente de CST', 'XDC Wizard': 'Assistente de XDC',
    'set_io led[0]: 50 is not a pin of the sg48 package (1…48).': 'set_io led[0]: 50 não é um pino do encapsulamento sg48 (1…48).',
    'LOCATE COMP led[0]: 12 is not a pin of the cabga381 package (its balls look like A1, B12, AA3).': 'LOCATE COMP led[0]: 12 não é um pino do encapsulamento cabga381 (as suas esferas são como A1, B12, AA3).',
    'IO_TYPE=LVCMOS33 of led_n[0]: the pin 10 (led_n<0>) is in a bank at 1.8 V on the Sipeed Tang Nano 9K (LVCMOS18), not 3.3 V.':
      'IO_TYPE=LVCMOS33 de led_n[0]: o pino 10 (led_n<0>) está num banco a 1.8 V na Sipeed Tang Nano 9K (LVCMOS18), não a 3.3 V.',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
});

// User data is never translated (#4705): the interface's labels that are also names a user gives (a project, a file, a
// module, a port: 'clock' shown as 'relógio' in Open Project) translate only where the element is the interface's; the
// elements that show user data are marked data-no-i18n (test/ui/i18n-user-names.test.js). These are the words of the
// dictionary that can be such a name (an identifier in lower case); a new one is checked first against every place
// where a user's name is shown.
test('#4705 the labels that are also names: the examples\' names, the identifiers the dictionary translates', async () => {
  const { EXAMPLE_ORDER } = await import('../core/examples.js');
  const strings = LOCALES.pt.strings;
  const translated = (k) => strings[k] !== undefined && strings[k] !== k;
  // the examples (a project made from one is named as it): only clock is also a label
  assert.deepEqual(EXAMPLE_ORDER.filter(translated), ['clock']);
  assert.deepEqual(Object.keys(strings).filter((k) => /^[a-z_][a-z0-9_]*$/.test(k) && translated(k)).sort(), [
    'always', 'and', 'async', 'asynchronous', 'auto', 'bidirectional', 'black', 'blue', 'both', 'changes', 'clock', 'contact',
    'default', 'down', 'enable', 'errors', 'falling', 'falls', 'follower', 'green', 'hidden', 'input', 'live', 'logic',
    'multiplier', 'name', 'net', 'no', 'none', 'optional', 'or', 'orange', 'output', 'owner', 'priority', 'purple', 'red',
    'rises', 'rising', 'sync', 'synchronous', 'tip', 'up', 'viewer', 'visible', 'white', 'yellow', 'yes', 'you']);
});

// #5164: the messages the Petri net, circuit and state diagram editors log in the console (drawings.js's onMessage: t()),
// those of the core's edits as the core makes them
test('#5164 the drawing editors\' messages in the console in Portuguese', async () => {
  const { newCircuit } = await import('../core/circuit.js');
  const { addPart, setPartProps } = await import('../core/circuit-edit.js');
  const { addStyledWire } = await import('../core/circuit-route.js');
  const c = addPart(newCircuit('c'), { type: 'clock', at: [0, 0] });
  const T = {
    // the Petri net's
    'An arc joins a place and a transition': 'Um arco liga um lugar e uma transição',
    'An inhibitor arc goes from a place to a transition': 'Um arco inibidor vai de um lugar para uma transição',
    'These two are joined already: change the weight of that arc': 'Estes dois já estão ligados: mude o peso desse arco',
    'fail1: not enabled (its guard is false)': 'fail1: não habilitada (a guarda é falsa)',
    'Deadlock: no transition can fire': 'Bloqueio: nenhuma transição pode disparar',
    'PNML: net.xml: not a PNML file (.pnml or .xml)': 'PNML: net.xml: não é um ficheiro PNML (.pnml ou .xml)',
    // the circuit's
    [setPartProps(c.model, c.id, { hz: 1e9 }).error]: 'hz: uma frequência de 0.1 a 50 Hz',
    [addStyledWire(c.model, { from: [5, 5], to: [5, 5], via: [] }).error]: 'um fio liga dois sítios diferentes',
    'W3: no clear orthogonal path (the parts\' pins and the other wires in the way): drawn straight there':
      'W3: nenhum caminho ortogonal livre (os pinos das peças e os outros fios no caminho): desenhado a direito aí',
    'The circuit cannot be simulated: U1 is not powered': 'O circuito não pode ser simulado: U1 is not powered',
    'Short circuit at 120 ns: S1.out, U1.1 driven to 0 and 1 at once': 'Curto-circuito aos 120 ns: S1.out, U1.1 levado a 0 e a 1 ao mesmo tempo',
    'The circuit oscillates: still changing 1000 ns after 0 ns (U1.2; U1.3)': 'O circuito oscila: ainda a mudar 1000 ns depois de 0 ns (U1.2; U1.3)',
    // the state diagram's (its reason, then "(not applied)")
    "State S0: The name 'S1' is used twice (letter case does not count)": "Estado S0: O nome 'S1' é usado duas vezes (maiúsculas e minúsculas não contam)",
    '(not applied)': '(não aplicado)',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
});

// #5185: the Petri net's and the circuit's Check (their errors and warnings in the console and its Errors / Warnings
// tabs: editor-problems.js inLanguage) in Portuguese, each message as the core makes it, on small drawings; the few the
// core's own tests make on drawings of their own (a KiCad part's, a 3-state's, a DIP switch's, a display's) as those
// tests have them. Every English part of the checks' messages (their templates in the core's sources) is in one of
// them, and none is left in a translation.
test('#5185 the Petri net\'s and the circuit\'s Check messages in Portuguese', async () => {
  const { checkCircuit } = await import('../core/circuit-check.js');
  const { normalizeCircuit } = await import('../core/circuit.js');
  const { partPins } = await import('../core/circuit-parts.js');
  const { checkPetri } = await import('../core/petri-analysis.js');
  const { halfAdder, icBench } = await import('./circuit-helpers.mjs');
  const { templatesOf } = await import('./js-literals.js');
  const VCC = [-20, -20], GND = [-20, -19];
  const circ = (m) => checkCircuit(normalizeCircuit(m)).map((d) => d.message);
  const pinAt = (m, id, n) => { const q = partPins(m.parts.find((p) => p.id === id)).find((x) => x.n === n); return [q.x, q.y]; };
  const plus = (m, parts = [], wires = []) => ({ ...m, parts: [...m.parts, ...parts], wires: [...m.wires, ...wires] });
  const W = (id, ...points) => ({ id, points, color: 'red' });
  const base = halfAdder();
  const label = (labels) => ({ ...base, parts: base.parts.map((p) => (labels[p.id] ? { ...p, label: labels[p.id] } : p)) });
  const inv = icBench('7404'), oc = icBench('7405'), oc0 = icBench('7405', { pullUps: false }), tri = icBench('74125');
  const floating = { ...inv, parts: inv.parts.filter((p) => p.id !== 'S1a'), wires: inv.wires.filter((w) => w.id !== 'w3') };
  const cmos = icBench('4011');
  const flip = { ...base, wires: base.wires.map((w) => (w.id === 'wv1' ? { ...w, points: [[4, 3], [4, -3]] } : w.id === 'wg1' ? { ...w, points: [[10, 9], [10, -4]] } : w)) };
  const made = [
    plus(base, [], [W('U1', [50, 0], [-6, 9])]), plus(base, [{ id: 'D3', type: 'led', x: 24, y: 2 }]),
    plus(base, [{ id: 'S3', type: 'logic-switch', x: 40, y: 0 }], [W('wx', [50, 0], [60, 0])]), { ...base, name: 'entity' },
    plus(base, [{ id: 'U1', type: '7404', x: 40, y: 40 }, { id: 'U9', type: '74999', x: 50, y: 50 }, { id: '', type: 'led', x: 60, y: 60 }]),
    label({ S2: 'a', D2: '2c' }), label({ D1: 'half_adder' }), plus(base, [{ id: 'S9', type: 'dip-4', x: 40, y: 20, label: 'd[0]' }]),
    plus(base, [{ id: 'S8', type: 'logic-switch', x: 40, y: 0, label: 'sw[0]' }, { id: 'S9', type: 'logic-switch', x: 40, y: 3, label: 'sw[2]' }]),
    plus(base, [{ id: 'S8', type: 'logic-switch', x: 40, y: 0, label: 'sw[0]' }, { id: 'D8', type: 'led', x: 40, y: 3, label: 'sw[1]' }, { id: 'D9', type: 'led', x: 40, y: 6, label: 'sw' }]),
    plus(tri, [], [W('x1', pinAt(tri, 'U1', 3), VCC)]), plus(base, [], [W('wx', [2, -4], [2, -3])]), plus(base, [], [W('wx', [-6, 9], [1, -4])]),
    plus(oc, [], [W('x1', pinAt(oc, 'U1', 2), VCC)]), plus(base, [], [W('wx', [6, 8], [15, 8])]), oc0,
    plus(floating, [{ id: 'B1', type: 'button', x: -30, y: -20 }], [W('v1', [-30, -20], [-20, -20]), W('v2', [-27, -20], [-27, -19], [-20, -19])]),
    plus(inv, [{ id: 'B1', type: 'button', x: -30, y: -30 }], [W('v1', [-30, -30], pinAt(inv, 'U1', 2)), W('v2', [-27, -30], VCC)]),
    flip, icBench('7404', { power: false }), floating,
    plus(floating, [{ id: 'B1', type: 'button', x: -10, y: 0 }], [W('v1', [-10, 0], pinAt(inv, 'U1', 1)), W('v2', [-7, 0], GND)]),
    { ...cmos, parts: cmos.parts.filter((p) => p.id !== 'S1a'), wires: cmos.wires.filter((w) => w.id !== 'w3') },
    plus(base, [{ id: 'D3', type: 'led', x: 40, y: 0 }], [W('wx', [40, 0], [-4, -3]), W('wy', [41, 0], [-4, -4])]),
    plus(base, [{ id: 'D3', type: 'led', x: 40, y: 0 }], [W('wx', [40, 0], [41, 0])]),
  ].flatMap(circ).filter((m) => !/^[ :]/.test(m));   // (the part with no id's other messages: its id empty)
  const CIRCUIT = [...new Set([...made,
    // (circuit-kicad.test.js, circuit-parts.test.js, circuit-kicad-hdl.test.js)
    'M1 (TEST-SENSOR) is drawn only: it is not simulated and its pins drive nothing',
    'U1 pin 1 (1A) floats while S9 is off: a 74LS input reads high',
    'DS1 never lights: its common anode is on the supply\'s − (a common cathode display\'s place)',
    'DS2 never lights: its common cathode is on the supply\'s + (a common anode display\'s place)',
    'U1 (TEST-INV): no module \'test_inv\' in the project', 'U1 (TEST-INV): its module test_inv has no port y (its pin 2)',
    'U1 (TEST-INV): its module test_inv\'s port z has no pin', 'U1 (TEST-INV): its pin 1 (A) is an input, its module test_inv\'s port a an output',
    'U1 (TEST-INV): its module test_inv\'s port y is 4 bits wide, a pin one',
    'U1 (TEST-FIN): its module m_finish cannot run in Try it: its simulation stopped (finish)',
    'U1 1Y, U2 1Y (3-state) and SX out drive one net: a short whenever one is enabled',
    'U1 1Y, U1 2Y: open collector with no pull-up: the net floats while they are off (a 74LS input reads it high, an LED stays off)',
    // (circuit-keypad.test.js, #5364)
    'U1 pin 1 (1A) floats while no key of KP1 is pressed: a 74LS input reads high', 'Short circuit while KP1 is pressed (its key 1): it joins the supply\'s + and −',
    // (circuit-sd.test.js, #5477)
    'SD1 (SD card module (SPI, microSD)) is not powered: its VCC (pin 2) is not on the supply\'s +', 'SD1\'s SCK, MOSI, CS are driven by nothing: no host talks to it',
    // (circuit-stepper.test.js, #5476)
    'M1 (Stepper motor (28BYJ-48, ULN2003 board)) is not powered: its VCC (pin 6) is not on the supply\'s +', 'M1\'s IN2, IN3, IN4 are driven by nothing: its coils\' cycle is not whole',
    'M1\'s IN1, IN2, IN3, IN4 are driven by nothing: it never turns',
    // (circuit-dht.test.js, #5470)
    'DHT1 (Temperature and humidity sensor (DHT22)) is not powered: its VCC (pin 1) is not on the supply\'s + and its GND (pin 4) is not on the supply\'s −',
    // (circuit-pir.test.js, #5463)
    'PIR1 (Motion sensor (PIR, HC-SR501)) is not powered: its VCC (pin 1) is not on the supply\'s + and its GND (pin 3) is not on the supply\'s −',
    // (circuit-sonar.test.js, #5456)
    'US1 (Ultrasonic range sensor (HC-SR04)) is not powered: its VCC (pin 1) is not on the supply\'s + and its GND (pin 4) is not on the supply\'s −', 'US1\'s Trig (pin 2) is driven by nothing: it never measures',
    // (circuit-buzzer.test.js, #5454)
    'BZ1 (Buzzer (active, 5 V)): its − (pin 2) is not on the supply\'s −: it never sounds', 'BZ1\'s + (pin 1) is driven by nothing: it stays silent',
    // (circuit-encoder.test.js, #5451)
    'U1 pin 1 (1A) floats while the switch of ENC1 is released: a 74LS input reads high', 'U1 pin 1 (1A) floats while the A contact of ENC1 is open: a 74LS input reads high',
    'Short circuit while ENC1 is turned (its A contact closed): it joins the supply\'s + and −', 'Short circuit while ENC1 is pressed (its switch): it joins the supply\'s + and −',
    'ENC1 joins two driven nets while turned (its B contact closed) (net 1; net 2): one of its sides must be driven by nothing else',
    // (circuit-servo.test.js, #5347)
    'M1\'s signal (pin 3) is driven by nothing: its arm stays where it is',
    // (circuit-lcd.test.js, #5330)
    'LCD1 (Character LCD 16×2 (HD44780)) is not powered: its VDD (pin 2) is not on the supply\'s + and its VSS (pin 1) is not on the supply\'s −',
    'LCD1\'s RW (pin 5) is not on GND: its reads are not simulated (tie it low, as LiquidCrystal\'s wiring does)',
    // (circuit-oled.test.js, #5336)
    'OLED1 (Graphic OLED 128×64 (SSD1306, I²C)) is not powered: its VCC (pin 2) is not on the supply\'s + and its GND (pin 1) is not on the supply\'s −',
    'OLED1\'s SCL (pin 3) has no pull-up: the I²C bus\'s lines are released high by a pull-up each',
  ])];
  // the Petri net's: a net with every problem of its validation, then nets whose token game deadlocks
  const P = (id, more = {}) => ({ id, name: id, ...more });
  const A = (id, from, to, more = {}) => ({ id, from, to, ...more });
  const petri = (m) => checkPetri(m).map((d) => d.message);
  const PETRI = [...new Set([
    { name: '1net', clock: 'go', reset: { name: 'busy' }, inputs: [{ name: 'go' }, { name: '2a' }], outputs: [{ name: 'busy' }],
      places: [P('p1', { tokens: 2 }), P('p2', { outputs: { zz: '1' } }), P('p3', { outputs: { busy: 'go' } }), P('p4')],
      transitions: [P('t1', { guard: 'go &' }), P('t2'), P('t3'), P('t4', { name: 'p4' })],
      arcs: [A('a1', 'p1', 'p2'), A('a2', 't1', 'p2', { inhibitor: true }), A('a3', 't2', 'p3'), A('a4', 'p3', 't3', { weight: 2 }), A('a5', 't3', 'p2', { weight: 2 })] },
    { name: 'signal' }, { name: 'context', places: [P('p1')], transitions: [P('t1')], arcs: [A('a1', 'p1', 't1')] },
    { name: 'net', places: [P('p1', { tokens: 1 }), P('p2')], transitions: [P('t1')], arcs: [A('a1', 'p1', 't1'), A('a2', 't1', 'p2')] },
  ].flatMap(petri))];
  // every English part of the messages' templates (and of their plain strings) in one of the messages
  const src = (f, from, to) => { const s = fs.readFileSync(new URL(`../core/${f}`, import.meta.url), 'utf8'); const i = s.indexOf(from); return s.slice(i, to ? s.indexOf(to, i) : undefined); };
  const parts = (s) => { const { strings, templates } = templatesOf(s); return [...strings.filter((x) => / /.test(x)), ...templates.flatMap((x) => x.parts)].map((x) => x.trim()).filter((x) => /[a-z]{3}/i.test(x)); };
  const English = {
    circuit: [...parts(src('circuit-check.js', 'export function checkCircuit', '/** The circuit\'s errors only')), ...parts(src('circuit-kicad-hdl.js', 'export function checkModels', '\n}\n'))],
    petri: [...parts(src('petri.js', 'export function validatePetri', 'export const petriErrors')), ...parts(src('petri-analysis.js', 'export function checkPetri', '/** Strongly'))],
  };
  for (const [k, list] of Object.entries({ circuit: CIRCUIT, petri: PETRI })) {
    assert.deepEqual(English[k].filter((x) => !list.some((m) => m.includes(x))), [], `${k}: the parts no message has`);
    assert.deepEqual(list.map((m) => [m, t(m)]).filter(([m, pt]) => pt === m || English[k].some((x) => x.length > 5 && pt.includes(x))), [], `${k}: English left`);
  }
  assert.deepEqual([CIRCUIT.length, PETRI.length], [90, 22]);
  // (the issue's, exactly; a guard's error and Try it's reason are the parser's and the simulator's own, as they come)
  const T = {
    'the net can reach a deadlock, no transition able to fire: after fail1, fail2, fail3': 'a rede pode chegar a um bloqueio, sem nenhuma transição capaz de disparar: depois de fail1, fail2, fail3',
    'U2 pin 1 (1A) is floating: a 74LS input reads high': 'U2 pino 1 (1A) está a flutuar: uma entrada 74LS lê 1',
    'Short circuit: the supply\'s + and − are joined (U1 pin 14 (VCC), U1 pin 7 (GND), …)': 'Curto-circuito: o + e o − da fonte estão ligados (U1 pino 14 (VCC), U1 pino 7 (GND), …)',
    '\'x\' is used twice (place and transition)': '\'x\' é usado duas vezes (lugar e transição)',
    'transition t1: guard \'go &\': unexpected end of expression': 'transição t1: guarda \'go &\': fim inesperado da expressão',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
});

// #5396: a circuit part's heading (U1: Logic switch) and I/O Pin Planning's board field (Board: Digilent Basys2), each
// with its own translation: the boards, circuit parts since #5215, made the first take the second
test('#5396 "Board: <board>" is I/O Pin Planning\'s field, not a circuit part\'s heading, in Portuguese', () => {
  assert.equal(t('Board: Digilent Basys2'), 'Placa: Digilent Basys2');
  assert.equal(t('Board: Digilent Nexys2'), 'Placa: Digilent Nexys2');
  assert.equal(t('SW1: Logic switch'), 'SW1: Interruptor lógico');
  assert.equal(t('F1: Digilent Basys2'), 'F1: Digilent Basys2');
});

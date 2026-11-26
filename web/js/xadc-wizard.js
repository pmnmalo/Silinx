// The XADC Wizard (#5385), New Source ▸ 'XADC (analog inputs)' ▸ Wizard: a module with the 7-series XADC reading the
// channels asked in its continuous sequence, each channel's last code on an output (core/xadc-wizard.js). The pages: the
// name, language and location -> DCLK (the board's oscillator by default), the reset, EOS and the channels (each its
// output's name) -> summary. It writes the module, its settings in its header: opening it from the Design pane reopens
// the wizard with them (web/js/wizard-modules.js).
import { api } from './api.js';
import { h, toast } from './ui.js';
import { appLog, commandError } from './console.js';
import { xadcModule, planXadc, XADC_CHANNELS } from '/core/xadc-wizard.js';
import { periodNs } from '/packages/silinx-fpga/src/parts.js';
import { identError } from '/core/modgen.js';
import { wizard, field, select, replaceGuard, closeBeforeReplace, moduleElsewhere } from './wizards.js';
import { S, app } from './app.js';
import { cleanLoc, namedPages } from './wizard-util.js';
import { designState } from './state-design.js';

const LANGS = [['vhdl', 'VHDL'], ['verilog', 'Verilog']];

// the board's oscillator, else 100 MHz
function boardMHz() {
  const b = S.devices?.boards?.find(x => x.id === S.project?.board);
  const r = b?.resources?.find(x => x.group === 'Clock' && x.extra?.period);
  const ns = r ? periodNs(r.extra.period) : null;
  return ns ? Math.round(1e6 / ns) / 1000 : 100;
}
/** Whether the project's device has an XADC (a 7-series part's `xadc`). */
const hasXadc = () => !!S.devices?.parts?.find(p => p.part === S.project?.device?.part)?.xadc || /^(artix7|kintex7|spartan7|zynq)/.test(S.project?.device?.family || '');

/** The wizard: a new module, or the module of `path` again (spec: its settings). Returns the path written, or undefined. */
export async function xadcWizard({ name = '', location = 'src', lang = null, path: editPath = null, spec: old = null, named = false, back = null } = {}) {
  if (!S.project) return;
  const pj = S.project;
  if (!hasXadc()) return commandError('XADC Wizard', 'The XADC Wizard makes a module for the XADC of the 7-series devices (Artix-7, Spartan-7, Kintex-7, Zynq-7000): choose one as the target device (Design Properties).');
  const L = lang || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const spec = structuredClone(old || { wizard: 'xadc', version: 1, name: 'xadc_read', lang: L, family: pj.device.family, dclkMHz: boardMHz(), dclk: 'clk', reset: 'rst', eos: 'eos',
    channels: [{ id: 'temp', port: 'temp' }] });
  if (!old && name) spec.name = name;
  const guard = replaceGuard('XADC Wizard');
  // ------------------------------------------------------------ page 1: name, language, location
  const nameIn = h('input', { type: 'text', class: 'xw-name', value: spec.name });
  const langSel = select(LANGS, spec.lang);
  const locIn = h('input', { type: 'text', class: 'xw-loc', value: editPath ? editPath.replace(/\/[^/]*$/, '') : cleanLoc(location) });
  const fileHint = h('span', { class: 'xw-file', 'data-no-i18n': '' });
  const path = () => editPath || `${cleanLoc(locIn.value)}/${nameIn.value.trim()}${langSel.value === 'verilog' ? '.v' : '.vhd'}`;
  const syncFile = () => { fileHint.textContent = path(); };
  [nameIn, locIn].forEach(e => e.addEventListener('input', syncFile));
  langSel.addEventListener('change', syncFile);
  if (editPath) [nameIn, langSel, locIn].forEach(e => { e.disabled = true; });
  const edited = editPath && (designState.sources || []).find(s => s.path === editPath)?.text !== xadcModule(old).code;
  const p1 = {
    title: 'Name and Language',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'The wizard writes a module with the XADC of the 7-series: it converts the channels you choose in turn, and each one\'s last 12-bit code is on an output of the module.'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } }, ...field('Module name:', nameIn), ...field('Language:', langSel), ...field('Location:', locIn), ...field('File:', fileHint)),
      edited ? h('div', { class: 'hint xw-edited', style: { marginTop: '10px', color: 'var(--danger)' } }, 'This module was changed by hand since the wizard wrote it: Finish writes it again from the wizard\'s settings, and the changes are lost.') : null),
    onShow: syncFile,
    validate: async () => {
      const n = nameIn.value.trim(), e = identError(n, langSel.value);
      if (e) return `Name: ${e}.`;
      if (!/^[A-Za-z0-9_/-]+$/.test(locIn.value.trim())) return 'Invalid location.';
      if (moduleElsewhere(n, path())) return `A module named '${n}' already exists.`;
      return editPath ? null : guard(path());
    },
  };
  // ------------------------------------------------------------ page 2: DCLK, reset, EOS, the channels
  const text = (cls, value) => h('input', { type: 'text', class: cls, value, style: { width: '110px' } });
  const fIn = h('input', { type: 'number', class: 'xw-mhz', value: String(spec.dclkMHz), min: '8', max: '250', step: 'any', style: { width: '110px' } });
  const clkIn = text('xw-dclk', spec.dclk), rstChk = h('input', { type: 'checkbox', class: 'xw-rst-on', checked: !!spec.reset }), rstIn = text('xw-rst', spec.reset || 'rst');
  const eosChk = h('input', { type: 'checkbox', class: 'xw-eos-on', checked: !!spec.eos }), eosIn = text('xw-eos', spec.eos || 'eos');
  const rows = XADC_CHANNELS.map((x) => {
    const on = spec.channels.find((c) => c.id === x.id);
    const chk = h('input', { type: 'checkbox', class: 'xw-ch-on', 'data-ch': x.id, checked: !!on });
    const port = h('input', { type: 'text', class: 'xw-ch-port', 'data-ch': x.id, value: on?.port ?? x.id, style: { width: '110px' } });
    return { x, chk, port, row: h('tr', {}, h('td', {}, chk), h('td', {}, x.label), h('td', { 'data-no-i18n': '' }, String(x.ch)), h('td', {}, port)) };
  });
  const note = h('div', { class: 'hint xw-note' });
  const sync = () => {
    spec.dclkMHz = +fIn.value; spec.dclk = clkIn.value.trim();
    spec.reset = rstChk.checked ? rstIn.value.trim() : ''; spec.eos = eosChk.checked ? eosIn.value.trim() : '';
    rstIn.disabled = !rstChk.checked; eosIn.disabled = !eosChk.checked;
    spec.channels = rows.filter((r) => r.chk.checked).map((r) => ({ id: r.x.id, port: r.port.value.trim() }));
    for (const r of rows) r.port.disabled = !r.chk.checked;
    const plan = planXadc(spec);
    note.textContent = plan.errors.length ? plan.errors[0] : plan.notes.join(' ');
    return plan;
  };
  [fIn, clkIn, rstIn, eosIn, ...rows.map((r) => r.port)].forEach(e => e.addEventListener('input', sync));
  [rstChk, eosChk, ...rows.map((r) => r.chk)].forEach(e => e.addEventListener('change', sync));
  const p2 = {
    title: 'Clock and Channels',
    render: () => h('div', {},
      h('div', { class: 'form-grid' }, ...field('DCLK frequency (MHz):', fIn), ...field('DCLK port:', clkIn),
        ...field('Reset input (RESET):', h('span', {}, rstChk, ' ', rstIn)), ...field('End of sequence output (EOS):', h('span', {}, eosChk, ' ', eosIn))),
      h('div', { style: { marginTop: '8px', maxHeight: '300px', overflow: 'auto', border: '1px solid var(--frame)' } },
        h('table', { class: 'xw-channels' }, h('tr', {}, h('th', {}, ''), h('th', {}, 'Channel'), h('th', {}, 'Number'), h('th', {}, 'Output port')), ...rows.map((r) => r.row))),
      note),
    onShow: sync,
    validate: () => {
      const plan = sync();
      if (plan.errors.length) return plan.errors[0];
      const err = (label, n) => { const e = identError(n, langSel.value); return e ? `${label}: ${e}.` : null; };
      const e = err('DCLK port', spec.dclk) || (spec.reset && err('Reset input', spec.reset)) || (spec.eos && err('EOS output', spec.eos)) || spec.channels.map((c) => err(`Output of ${c.id}`, c.port)).find(Boolean);
      if (e) return e;
      const names = [spec.dclk, spec.reset, spec.eos, ...spec.channels.flatMap((c) => (/^vaux/.test(c.id) ? [c.port, `${c.port}_p`, `${c.port}_n`] : c.id === 'vpvn' ? [c.port, 'vp', 'vn'] : [c.port]))].filter(Boolean);
      return new Set(names.map(n => n.toLowerCase())).size !== names.length ? 'Two ports have the same name.' : null;
    },
  };
  // ------------------------------------------------------------ page 3: summary
  const summary = h('pre', { class: 'xw-summary code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      spec.name = nameIn.value.trim(); spec.lang = langSel.value;
      const plan = planXadc(spec);
      summary.textContent = [`The wizard will ${editPath ? 'write again' : 'create'} ${path()} (${spec.lang === 'vhdl' ? 'VHDL' : 'Verilog'}): the module ${spec.name}, an XADC reading ${spec.channels.length} channel(s).`, '',
        `DCLK: ${spec.dclk}, ${spec.dclkMHz} MHz`, ...spec.channels.map((c) => `${c.port}: ${XADC_CHANNELS.find((x) => x.id === c.id).label}`), ...(spec.reset ? [`Reset: ${spec.reset}`] : []), ...(spec.eos ? [`EOS: ${spec.eos}`] : []), ...plan.notes].join('\n');
    },
    validate: () => (editPath ? null : guard(path())),
  };
  let code, plan;
  const ok = await wizard('XADC Wizard', namedPages(p1, [p1, p2, pSum], named), { width: 820, back, finish: () => {
    spec.name = nameIn.value.trim(); spec.lang = langSel.value;
    ({ code, plan } = xadcModule(spec));
    return code ? null : plan.errors.join(' ');
  } });
  if (!ok) return;
  const p = path();
  await closeBeforeReplace(p);
  await api.writeFile(pj.name, p, code);
  await app.reloadProject();
  appLog(`XADC Wizard: ${editPath ? 'wrote again' : 'created'} ${p}, the module ${spec.name}: ${spec.channels.map((c) => c.port).join(', ')}.`, 'ok');
  toast(`XADC module ${spec.name} ${editPath ? 'updated' : 'created'}`, 'ok');
  return p;
}

// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The register map editor (#5288, docs/SYSTEMS.md): a System's register map (<name>.regs.json, core/regmap.js), its
// registers in a table, a row each (its address, name, width, access, reset, strobe), its bus in the toolbar (SPI, or
// I²C at its address). Its HDL file is made from it (core/view-hdl.js, as a drawing's); its Header button writes the
// Arduino's header (core/regmap-c.js). No hint line: its counts in its status line; its problems (`onProblems`, after
// every change: core/regmap.js checkRegmap) and its messages go to the console (#2718).
//
//   const ed = mountRegmapEditor(container, { model, onChange(model), onProblems(diags), onCheck(diags), onHeader(),
//     readOnly, banner });
//   ed.getModel(); ed.setModel(m); ed.undo(); ed.redo(); ed.canUndo(); ed.canRedo(); ed.check(); ed.select(name);
//   ed.destroy();
import { h } from './ui.js';
import { statusLine } from './status-line.js';
import { toolWide } from './editor-icons.js';
import { normalizeRegmap, newRegmap, checkRegmap, hexByte } from '/core/regmap.js';

const ACCESS = [['rw', 'rw'], ['ro', 'ro'], ['wo', 'wo']];
const bytesOf = r => Math.max(1, Math.ceil(Number(r.width) / 8));

export function mountRegmapEditor(container, opts = {}) {
  let M = normalizeRegmap(opts.model || newRegmap('regs'));
  let sel = M.registers[0]?.name ?? null;
  const readOnly = !!opts.readOnly;
  const hist = [JSON.stringify(M)];
  let hi = 0, destroyed = false;

  container.innerHTML = '';
  const root = h('div', { class: 'asm-editor regmap-editor', tabindex: '0' });
  container.append(root);
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);

  // ---------------------------------------------------------------- toolbar
  const bus = h('select', { class: 'asm-input regs-bus', title: 'The bus the microcontroller reads and writes the registers on' },
    h('option', { value: 'spi' }, 'SPI'), h('option', { value: 'i2c' }, 'I²C'));
  bus.addEventListener('change', () => edit({ ...M, bus: bus.value, address: bus.value === 'i2c' ? M.address ?? 0x42 : undefined }));
  const address = h('input', { type: 'text', class: 'asm-input mono regs-address', title: 'The I²C address of the FPGA (7 bits: 0x08 to 0x77)' });
  address.addEventListener('change', () => { const v = Number(address.value.trim()); edit({ ...M, address: Number.isInteger(v) ? v : address.value.trim() }); });
  const addrLabel = h('span', { class: 'asm-label regs-address-label' }, 'Address');
  const toolbar = h('div', { class: 'asm-toolbar' },
    ...(readOnly ? [] : [btn('+ Register', 'Add a register after the last one', () => addRegister(), 'asm-wide regs-add'),
      btn('Remove', 'Remove the selected register', () => removeRegister(), 'regs-remove'), h('span', { class: 'asm-sep' })]),
    h('span', { class: 'asm-label' }, 'Bus'), bus, addrLabel, address, h('span', { class: 'asm-sep' }),
    toolWide('check', 'Check', 'Check the register map: its names, addresses, widths and resets', () => opts.onCheck?.(check()), 'regs-check'),
    btn('Header', 'Write the Arduino\'s header of the map (firmware/<name>.h): its addresses, a read and a write for each register', () => opts.onHeader?.(), 'asm-wide regs-header'),
    ...(opts.banner ? [h('span', { class: 'asm-spacer' }), opts.banner] : []));
  // ---------------------------------------------------------------- the table
  const table = h('table', { class: 'regs-table' });
  const body = h('div', { class: 'regs-body' }, table);
  const { el: statusEl, set: setStatus } = statusLine('regs-status');
  root.append(toolbar, body, statusEl);

  // a register's field changed (a number: its text read, kept as typed when it is not one, for the check to say)
  const num = s => { const v = Number(String(s).trim()); return String(s).trim() !== '' && Number.isInteger(v) ? v : String(s).trim(); };
  const setReg = (name, fields) => edit({ ...M, registers: M.registers.map(r => (r.name === name ? { ...r, ...fields } : r)) }, fields.name != null && sel === name ? fields.name : sel);
  const cell = (r, key, value, onChange, cls = '') => {
    const i = h('input', { type: 'text', class: `asm-input mono regs-${key} ${cls}`, value: String(value ?? ''), disabled: readOnly });
    i.addEventListener('change', () => onChange(i.value));
    i.addEventListener('focus', () => select(r.name, false));
    return h('td', {}, i);
  };
  function render() {
    bus.value = M.bus;
    bus.disabled = readOnly;
    addrLabel.hidden = address.hidden = M.bus !== 'i2c';
    address.value = M.bus === 'i2c' ? (Number.isInteger(M.address) ? hexByte(M.address) : String(M.address ?? '')) : '';
    address.disabled = readOnly;
    table.replaceChildren(h('tr', {}, ...['Address', 'Name', 'Width', 'Access', 'Reset value', 'Strobe'].map(c => h('th', {}, c))),
      ...M.registers.map(r => {
        const access = h('select', { class: 'asm-input regs-access', disabled: readOnly }, ...ACCESS.map(([v, l]) => h('option', { value: v, selected: r.access === v }, l)));
        access.addEventListener('change', () => setReg(r.name, { access: access.value }));
        access.addEventListener('focus', () => select(r.name, false));
        const strobe = h('input', { type: 'checkbox', class: 'regs-strobe', checked: !!r.strobe, disabled: readOnly || r.access === 'ro', title: 'A pulse <name>_wr, one clock cycle, when its last byte is written' });
        strobe.addEventListener('change', () => setReg(r.name, { strobe: strobe.checked }));
        return h('tr', { class: `regs-row${r.name === sel ? ' sel' : ''}`, 'data-name': r.name, onclick: () => select(r.name, false) },
          cell(r, 'addr', Number.isInteger(r.addr) ? hexByte(r.addr) : r.addr, v => setReg(r.name, { addr: num(v) })),
          cell(r, 'name', r.name, v => setReg(r.name, { name: v.trim() })),
          cell(r, 'width', r.width, v => setReg(r.name, { width: num(v) })),
          h('td', {}, access),
          r.access === 'ro' ? h('td', {}) : cell(r, 'reset', r.reset, v => setReg(r.name, { reset: num(v) })),
          h('td', {}, strobe));
      }));
    const bytes = M.registers.reduce((a, r) => a + bytesOf(r), 0);
    const n = M.registers.length;
    setStatus([{ text: `${n} register${n === 1 ? '' : 's'} · ${bytes} byte${bytes === 1 ? '' : 's'}`, cls: 'asm-info' }]);
  }
  function select(name, again = true) {
    sel = name;
    for (const tr of table.querySelectorAll('.regs-row')) tr.classList.toggle('sel', tr.dataset.name === name);
    if (again) table.querySelector(`.regs-row[data-name="${CSS.escape(name)}"] .regs-name`)?.focus();
  }
  const check = () => checkRegmap(M);
  function edit(next, keep = sel) {
    if (readOnly) return;
    M = normalizeRegmap(next);
    sel = M.registers.some(r => r.name === keep) ? keep : M.registers[0]?.name ?? null;
    hist.splice(hi + 1);
    hist.push(JSON.stringify(M));
    hi = hist.length - 1;
    render();
    opts.onChange?.(M);
    opts.onProblems?.(check());
  }
  function addRegister() {
    const used = new Set(M.registers.map(r => r.name.toLowerCase()));
    let i = 1;
    while (used.has(`reg${i}`)) i++;
    const addr = M.registers.reduce((a, r) => Math.max(a, (Number.isInteger(r.addr) ? r.addr : 0) + bytesOf(r)), 0);
    edit({ ...M, registers: [...M.registers, { name: `reg${i}`, addr, width: 8, access: 'rw' }] }, `reg${i}`);
    select(`reg${i}`);
  }
  function removeRegister() {
    if (sel == null) return;
    edit({ ...M, registers: M.registers.filter(r => r.name !== sel) }, null);
  }
  const restore = k => { hi = k; M = normalizeRegmap(JSON.parse(hist[hi])); if (!M.registers.some(r => r.name === sel)) sel = M.registers[0]?.name ?? null; render(); opts.onChange?.(M); opts.onProblems?.(check()); };

  render();
  opts.onProblems?.(check());
  return {
    getModel: () => normalizeRegmap(M),
    setModel(m) { M = normalizeRegmap(m); hist.splice(0, hist.length, JSON.stringify(M)); hi = 0; render(); opts.onProblems?.(check()); },
    undo: () => { if (hi > 0) restore(hi - 1); },
    redo: () => { if (hi < hist.length - 1) restore(hi + 1); },
    canUndo: () => !readOnly && hi > 0,
    canRedo: () => !readOnly && hi < hist.length - 1,
    check, select, readOnly: () => readOnly,
    destroy() { destroyed = true; container.innerHTML = ''; },
    get destroyed() { return destroyed; },
  };
}

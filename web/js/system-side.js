// The System editor's side panel (#4700, web/js/system-editor.js): the selection's properties, each change an edit of
// core/system-edit.js (the MCP server's edit_system's): a node's id, an FPGA node's module, board, variant and its ports'
// pins, a microcontroller's board and firmware (a .hex / .elf of the project); an interface's name, a UART's TX and RX
// ports, baud and frame, GPIO's pins and direction; a link's id and ends; and the System's name. An edit refused says
// why in the console (opts.onMessage).
import { h } from './ui.js';
import { BOARDS } from '/core/devices.js';
import { MCU_BOARDS } from '/core/system-doc.js';
import { BAUDS } from '/core/uart.js';
import { changeNode, changeInterface, addInterface, removeInterface, changeLink, NODE_KIND_NAMES } from '/core/system-edit.js';

/** { renderSide } of mountSystemEditor (M(), sel(): its values; apply(r): an edit's result taken, or its error said). */
export function mountSystemSide(ctx) {
  const { opts, M, sel, setSel, apply, selSection, sysBody, btn } = ctx;
  const field = (label, input, hint) => h('label', { class: 'asm-field' }, h('span', { class: 'asm-label' }, label), input, hint ? h('span', { class: 'asm-fhint' }, hint) : null);
  const text = (value, onChange, cls = 'mono') => { const i = h('input', { type: 'text', class: `asm-input ${cls}`, value: value ?? '', spellcheck: 'false' }); i.addEventListener('change', () => onChange(i.value.trim())); return i; };
  const choose = (value, options, onChange, cls = '') => {
    const s = h('select', { class: `asm-input ${cls}` }, ...options.map(([v, label]) => h('option', { value: v }, label)));
    s.value = value ?? '';
    s.addEventListener('change', () => onChange(s.value));
    return s;
  };
  // a node's or an interface's edit taken: the selection follows its new id
  const take = (r, kind) => { if (apply(r) && r.id) setSel({ kind, id: r.id }); };

  function nodeFields(n) {
    const out = [h('h3', {}, `${NODE_KIND_NAMES[n.kind] || n.kind} ${n.id}`), field('Id', text(n.id, v => take(changeNode(M(), n.id, { id: v }), 'node')))];
    if (n.kind === 'fpga') {
      const mods = opts.modules?.() || [];
      const board = BOARDS.find(b => b.id === n.board);
      out.push(field('Module', choose(n.module, [['', '(none)'], ...mods.map(m => [m, m])], v => take(changeNode(M(), n.id, { module: v }), 'node'), 'sys-module')),
        field('Board', choose(n.board, BOARDS.map(b => [b.id, b.name]), v => take(changeNode(M(), n.id, { board: v, variant: null }), 'node'), 'sys-board')));
      if (board?.variants?.length) out.push(field('Variant', choose(n.variant || '', [['', '(the board\'s)'], ...board.variants.map(v => [v.id, v.id])], v => take(changeNode(M(), n.id, { variant: v }), 'node'), 'sys-variant')));
      // the pins of the ports its interfaces name
      const ports = [...new Set(n.interfaces.flatMap(f => (f.kind === 'uart' ? [f.tx, f.rx] : f.pins)).filter(Boolean))];
      if (ports.length) out.push(h('div', { class: 'asm-label' }, 'Pins of the board'), ...ports.map(p => field(p, text(n.pins[p], v => take(changeNode(M(), n.id, { pins: { [p]: v } }), 'node'), 'mono sys-pin'))));
      out.push(h('div', { class: 'asm-row' },
        btn('+ UART', 'Add a UART interface: its TX and RX ports', () => take(addInterface(M(), n.id, { kind: 'uart' }), 'iface'), 'asm-small sys-add-uart'),
        btn('+ GPIO', 'Add GPIO wires: their ports and direction', () => take(addInterface(M(), n.id, { kind: 'gpio' }), 'iface'), 'asm-small sys-add-gpio')));
    } else if (n.kind === 'mcu') {
      const fw = opts.firmwares?.() || [];
      out.push(field('Board', choose(n.board, MCU_BOARDS.map(b => [b.id, b.name]), v => take(changeNode(M(), n.id, { board: v }), 'node'), 'sys-board')),
        field('Firmware', choose(n.firmware || '', [['', '(none)'], ...[...new Set([...fw, ...(n.firmware ? [n.firmware] : [])])].map(f => [f, f])], v => take(changeNode(M(), n.id, { firmware: v }), 'node'), 'sys-firmware'), 'a .hex or an .elf of the project'),
        h('div', { class: 'asm-row' }, btn('+ GPIO', 'Add GPIO wires: the board\'s pins and their direction', () => take(addInterface(M(), n.id, { kind: 'gpio' }), 'iface'), 'asm-small sys-add-gpio')));
    }
    return out;
  }

  function ifaceFields(nid, name) {
    const n = M().nodes.find(x => x.id === nid), f = n?.interfaces.find(x => x.name === name);
    if (!f) return [];
    const change = fields => take(changeInterface(M(), nid, name, fields), 'iface');
    const out = [h('h3', {}, `${f.kind === 'uart' ? 'UART' : 'GPIO'} ${nid}.${name}`)];
    if (n.kind === 'fpga' || f.kind === 'gpio') out.push(field('Name', text(f.name, v => change({ name: v }))));
    if (f.kind === 'uart') {
      if (n.kind === 'fpga') {
        const ports = opts.portsOf?.(n.module) || [];
        const portChoice = (v, dir) => choose(v || '', [['', '(none)'], ...ports.filter(p => p.dir === dir || p.dir === 'inout').map(p => [p.name, p.name]), ...(v && !ports.some(p => p.name === v) ? [[v, v]] : [])], x => change({ [dir === 'out' ? 'tx' : 'rx']: x }), `sys-${dir === 'out' ? 'tx' : 'rx'}`);
        out.push(field('TX (an output of the module)', portChoice(f.tx, 'out')), field('RX (an input of the module)', portChoice(f.rx, 'in')));
      }
      const baud = h('input', { type: 'number', class: 'asm-input sys-baud', value: String(f.baud), min: '1', list: 'sys-bauds' });
      baud.addEventListener('change', () => change({ baud: Math.round(+baud.value) }));
      out.push(field('Baud', h('span', {}, baud, h('datalist', { id: 'sys-bauds' }, ...BAUDS.map(b => h('option', { value: String(b) }))))),
        field('Frame', text(f.frame, v => change({ frame: v.toUpperCase() }), 'mono sys-frame'), 'data bits, parity, stop bits: 8N1, 7E1…'));
    } else {
      out.push(field('Pins', text(f.pins.join(', '), v => change({ pins: v.split(/[,;\s]+/).filter(Boolean) }), 'mono sys-pins'), n.kind === 'fpga' ? 'the module\'s ports, a bus\'s bit as led<0>' : 'the board\'s pins: D2, A0…'),
        field('Direction', choose(f.dir, [['in', 'in'], ['out', 'out']], v => change({ dir: v }), 'sys-dir')));
    }
    if (n.kind === 'fpga' || f.kind === 'gpio') out.push(h('div', { class: 'asm-row' }, btn('Remove Interface', 'Remove the interface and its link', () => { if (apply(removeInterface(M(), nid, name))) setSel({ kind: 'node', id: nid }); }, 'asm-small asm-danger')));
    return out;
  }

  function renderSide() {
    const s = sel();
    selSection.replaceChildren();
    selSection.hidden = !s;
    if (s?.kind === 'node') { const n = M().nodes.find(x => x.id === s.id); if (n) selSection.append(...nodeFields(n)); }
    else if (s?.kind === 'iface') { const i = s.id.indexOf('.'); selSection.append(...ifaceFields(s.id.slice(0, i), s.id.slice(i + 1))); }
    else if (s?.kind === 'link') {
      const l = M().links.find(x => x.id === s.id);
      if (l) selSection.append(h('h3', {}, `Link ${l.id}`), field('Id', text(l.id, v => take(changeLink(M(), l.id, { id: v }), 'link'))),
        h('div', { class: 'asm-label sys-ends' }, `${l.kind === 'uart' ? 'UART' : 'GPIO'}: ${l.a} ↔ ${l.b}`));
    }
    sysBody.replaceChildren(field('Name', text(M().name, v => { if (v) apply({ system: { ...M(), name: v } }); })));
  }
  return { renderSide };
}

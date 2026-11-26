// The System editor's side panel (#4700, web/js/system-editor.js): the selection's properties, each change an edit of
// core/system-edit.js (the MCP server's edit_system's): a node's id, an FPGA node's module, board, variant and its
// constraints file (its pins: its I/O Pin Planning, #5581, its Text view the file, #5642), a microcontroller's board and firmware (a .hex / .elf of the project), either's USB id and serial number (#5489); an interface's name, a UART's TX and RX
// ports, baud and frame, GPIO's pins and direction; a link's id and ends; and the System's name. An edit refused says
// why in the console (opts.onMessage).
import { h } from './ui.js';
import { BOARDS } from '/core/devices.js';
import { MCU_BOARDS, mcuBoard } from '/core/system-doc.js';
import { BAUDS } from '/core/uart.js';
import { readUsbId, usbIdText } from '/core/usb-id.js';
import { changeNode, changeInterface, addInterface, removeInterface, changeLink, NODE_KIND_NAMES } from '/core/system-edit.js';
import { nodeConstraintsPath } from '/core/system-constraints.js';

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

  // an FPGA node's SPI ports guessed from its module's: sck (sclk), mosi, miso, ss (cs, csn)
  const spiPorts = n => {
    const ps = (opts.portsOf?.(n.module) || []).map(p => p.name), find = re => ps.find(p => re.test(p));
    return Object.fromEntries(Object.entries({ sck: /^s?sclk$|^sck$/i, mosi: /^mosi$|^sdi$/i, miso: /^miso$|^sdo$/i, ss: /^(ss|cs)_?n?$/i }).map(([k, re]) => [k, find(re)]).filter(([, v]) => v));
  };
  // and its I²C ports: scl, sda (#5214)
  const i2cPorts = n => {
    const ps = (opts.portsOf?.(n.module) || []).map(p => p.name), find = re => ps.find(p => re.test(p));
    return Object.fromEntries(Object.entries({ scl: /^(i2c_)?scl$/i, sda: /^(i2c_)?sda$/i }).map(([k, re]) => [k, find(re)]).filter(([, v]) => v));
  };
  // its board's USB id and serial number (#5489: the board told apart from another of the same kind); an id that is not one
  // given as it is, for the edit's message
  const usbFields = n => [
    field('USB id', text(n.usb?.vendor ? usbIdText({ vendor: n.usb.vendor, product: n.usb.product }) : '', v => {
      const id = readUsbId(v);
      take(changeNode(M(), n.id, { usb: !v ? { vendor: null, product: null } : id ? { vendor: id.vendor, product: id.product } : { vendor: v } }), 'node');
    }, 'mono sys-usb-id'), "vendor:product, hexadecimal (empty: the board's)"),
    field('USB serial', text(n.usb?.serial, v => take(changeNode(M(), n.id, { usb: { serial: v } }), 'node'), 'mono sys-usb-serial'), 'its board told apart from another of the same kind'),
  ];
  function nodeFields(n) {
    const out = [h('h3', {}, `${NODE_KIND_NAMES[n.kind] || n.kind} ${n.id}`), field('Id', text(n.id, v => take(changeNode(M(), n.id, { id: v }), 'node')))];
    if (n.kind === 'fpga') {
      const mods = opts.modules?.() || [];
      const board = BOARDS.find(b => b.id === n.board);
      out.push(field('Module', choose(n.module, [['', '(none)'], ...mods.map(m => [m, m])], v => take(changeNode(M(), n.id, { module: v }), 'node'), 'sys-module')),
        field('Board', choose(n.board, BOARDS.map(b => [b.id, b.name]), v => take(changeNode(M(), n.id, { board: v, variant: null }), 'node'), 'sys-board')));
      if (board?.variants?.length) out.push(field('Variant', choose(n.variant || '', [['', '(the board\'s)'], ...board.variants.map(v => [v.id, v.id])], v => take(changeNode(M(), n.id, { variant: v }), 'node'), 'sys-variant')));
      out.push(...usbFields(n));
      // its pins: its constraints file's, edited by its I/O Pin Planning (#5581: web/js/system-constraints-ui.js; its Text
      // view the file as text, Edit Constraints (Text) of before, #5642)
      const ui = f => async () => (await import('./system-constraints-ui.js'))[f](n.id);
      out.push(field('Constraints', h('span', { class: 'mono sys-constraints', 'data-no-i18n': '' }, nodeConstraintsPath(n))),
        h('div', { class: 'asm-row' }, btn('I/O Pin Planning', 'Its module\'s ports on its board\'s pins, written to its constraints file', ui('openNodePins'), 'asm-small sys-pins')));
      out.push(h('div', { class: 'asm-row' },
        btn('+ UART', 'Add a UART interface: its TX and RX ports', () => take(addInterface(M(), n.id, { kind: 'uart' }), 'iface'), 'asm-small sys-add-uart'),
        btn('+ GPIO', 'Add GPIO wires: their ports and direction', () => take(addInterface(M(), n.id, { kind: 'gpio' }), 'iface'), 'asm-small sys-add-gpio'),
        btn('+ SPI', 'Add an SPI bus, the peripheral: its SCK, MOSI, MISO and SS ports', () => take(addInterface(M(), n.id, { kind: 'spi', ...spiPorts(n) }), 'iface'), 'asm-small sys-add-spi'),
        btn('+ I²C', 'Add an I²C bus, the peripheral: its SCL port and its SDA, an inout port', () => take(addInterface(M(), n.id, { kind: 'i2c', ...i2cPorts(n) }), 'iface'), 'asm-small sys-add-i2c')));
    } else if (n.kind === 'mcu') {
      const pic = mcuBoard(n.board)?.arch === 'pic24';
      const fw = (opts.firmwares?.(n.id) || []).filter(f => !pic || /\.hex$/i.test(f));   // (its folder's, #5488; a PIC24's .hex only, #5484)
      out.push(field('Board', choose(n.board, MCU_BOARDS.map(b => [b.id, b.name]), v => take(changeNode(M(), n.id, { board: v }), 'node'), 'sys-board')),
        ...usbFields(n),
        field('Firmware', choose(n.firmware || '', [['', '(none)'], ...[...new Set([...fw, ...(n.firmware ? [n.firmware] : [])])].map(f => [f, f])], v => take(changeNode(M(), n.id, { firmware: v }), 'node'), 'sys-firmware'), pic ? 'a .hex of the project (XC16\'s)' : 'a .hex or an .elf of the project'),
        // (the Explorer 16/32's SPI and I²C links: #5484's next part)
        h('div', { class: 'asm-row' }, btn('+ GPIO', 'Add GPIO wires: the board\'s pins and their direction', () => take(addInterface(M(), n.id, { kind: 'gpio' }), 'iface'), 'asm-small sys-add-gpio'),
          ...(pic ? [] : [btn('+ SPI', 'Add the board\'s SPI bus, the master: SCK D13, MOSI D11, MISO D12, SS D10', () => take(addInterface(M(), n.id, { kind: 'spi' }), 'iface'), 'asm-small sys-add-spi'),
            btn('+ I²C', 'Add the board\'s I²C bus (Wire), the master: SCL A5, SDA A4', () => take(addInterface(M(), n.id, { kind: 'i2c' }), 'iface'), 'asm-small sys-add-i2c')])));
    } else if (n.kind === 'circuit') {
      // (its circuit, #5215: a .circ.json of the project, its boards the nodes their labels name)
      const cs = opts.circuits?.(n.id) || [];   // (its folder's, #5488)
      out.push(field('Circuit', choose(n.circuit || '', [['', '(none)'], ...[...new Set([...cs, ...(n.circuit ? [n.circuit] : [])])].map(f => [f, f])], v => take(changeNode(M(), n.id, { circuit: v }), 'node'), 'sys-circuit'), 'a .circ.json of the project: its boards are the nodes their labels name'));
    }
    return out;
  }

  function ifaceFields(nid, name) {
    const n = M().nodes.find(x => x.id === nid), f = n?.interfaces.find(x => x.name === name);
    if (!f) return [];
    const change = fields => take(changeInterface(M(), nid, name, fields), 'iface');
    const out = [h('h3', {}, `${{ uart: 'UART', gpio: 'GPIO', spi: 'SPI', i2c: 'I²C' }[f.kind] || f.kind} ${nid}.${name}`)];
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
    } else if (f.kind === 'spi') {
      // (#5214: the peripheral's ports, an FPGA's; the master's pins its board's)
      if (n.kind === 'fpga') {
        const ports = opts.portsOf?.(n.module) || [];
        const portChoice = (k, dir) => choose(f[k] || '', [['', '(none)'], ...ports.filter(p => p.dir === dir || p.dir === 'inout').map(p => [p.name, p.name]), ...(f[k] && !ports.some(p => p.name === f[k]) ? [[f[k], f[k]]] : [])], x => change({ [k]: x }), `sys-${k}`);
        out.push(field('SCK (an input of the module)', portChoice('sck', 'in')), field('MOSI (an input)', portChoice('mosi', 'in')),
          field('MISO (an output)', portChoice('miso', 'out')), field('SS (an input)', portChoice('ss', 'in')));
      }
      const hz = h('input', { type: 'number', class: 'asm-input sys-hz', value: String(f.hz), min: '1' });
      hz.addEventListener('change', () => change({ hz: Math.round(+hz.value) }));
      out.push(field('SCK rate (Hz)', hz, 'at least the program\'s: 125000 at SPI_CLOCK_DIV128'), field('Mode', choose(String(f.mode), [0, 1, 2, 3].map(m => [String(m), String(m)]), v => change({ mode: Number(v) }), 'sys-mode')));
    } else if (f.kind === 'i2c') {
      // (#5214: the peripheral's ports, an FPGA's, its SDA an inout port; the master's pins its board's)
      if (n.kind === 'fpga') {
        const ports = opts.portsOf?.(n.module) || [];
        const portChoice = (k, dirs) => choose(f[k] || '', [['', '(none)'], ...ports.filter(p => dirs.includes(p.dir)).map(p => [p.name, p.name]), ...(f[k] && !ports.some(p => p.name === f[k]) ? [[f[k], f[k]]] : [])], x => change({ [k]: x }), `sys-${k}`);
        out.push(field('SCL (an input of the module)', portChoice('scl', ['in', 'inout'])), field('SDA (an inout port)', portChoice('sda', ['inout'])));
      }
      const hz = h('input', { type: 'number', class: 'asm-input sys-hz', value: String(f.hz), min: '1' });
      hz.addEventListener('change', () => change({ hz: Math.round(+hz.value) }));
      out.push(field('SCL rate (Hz)', hz, 'at least the program\'s: 100000 with Wire'));
    } else {
      out.push(field('Pins', text(f.pins.join(', '), v => change({ pins: v.split(/[,;\s]+/).filter(Boolean) }), 'mono sys-pins'), n.kind === 'fpga' ? 'the module\'s ports, a bus\'s bit as led<0>' : mcuBoard(n.board)?.arch === 'pic24' ? 'the board\'s pins: RA0, RD6…' : 'the board\'s pins: D2, A0…'),
        field('Direction', choose(f.dir, [['in', 'in'], ['out', 'out']], v => change({ dir: v }), 'sys-dir')));
    }
    if (n.kind === 'fpga' || f.kind !== 'uart') out.push(h('div', { class: 'asm-row' }, btn('Remove Interface', 'Remove the interface and its link', () => { if (apply(removeInterface(M(), nid, name))) setSel({ kind: 'node', id: nid }); }, 'asm-small asm-danger')));
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

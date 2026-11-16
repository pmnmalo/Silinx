// The circuit editor's side panel (#3897, docs/CIRCUITS.md): its sections, as every editor's Properties (#2735; the parts
// library a panel of its own on the left, #4062: circuit-parts-panel.js): the selection's (a part's label, an LED's colour,
// an IC's pinout, the part's details, #4126; a wire's colour) and the circuit's (its name; its HDL's language Source Properties', #4168, #4240),
// the circuit's shown only while nothing is selected (#4303). Its edits are core/circuit-edit.js's.
import { h } from './ui.js';
import { partDef, LED_COLORS, WIRE_COLORS, CLOCK_HZ } from '/core/circuit-parts.js';
import { setPartProps, setWireProps } from '/core/circuit-edit.js';
import { portName } from '/core/circuit.js';
import { partInfo } from '/core/circuit-part-info.js';

// the selected part's details (#4126, core/circuit-part-info.js): what it does; an IC's chip, family, package, supply,
// logic, delay, outputs, an input left open; a part's pins' roles (an IC's: its pinout above)
function infoBlock(info) {
  const v = (x) => h('span', { 'data-no-i18n': 'true' }, x);
  const rows = [['Chip', info.chip && v(info.chip)], ['Family', info.family && v(info.family)], ['Package', info.package && v(info.package)],
    ['Supply', info.power && v(info.power)], ['Logic', info.logic && h('span', {}, ...info.logic.map((l) => h('div', { 'data-no-i18n': 'true' }, l)))],
    ['Typical delay', info.delay && v(`${info.delay} ns`)], ['Outputs', info.openCollector && 'Open collector'],
    ['An input left open', info.openInput && (info.openInput === '1' ? 'Reads 1 (a TTL input)' : 'Reads X (unknown): connect every CMOS input')],
    // (a project's KiCad part, #4281: its file and symbol, its part number, where it comes from)
    ...kicadRows(info.kicad, v)].filter(([, x]) => x);
  const pins = !info.chip && info.pins.length ? h('table', { class: 'circ-info-pins' }, ...info.pins.map((q) => h('tr', {}, h('td', { class: 'n' }, String(q.n)), h('td', { 'data-no-i18n': 'true' }, q.name), h('td', {}, q.role)))) : null;
  return h('div', { class: 'circ-info' }, h('div', { class: 'circ-lib-title' }, 'Part info'), info.about ? h('div', { class: 'circ-note' }, info.about) : null,
    rows.length ? h('table', { class: 'circ-info-rows' }, ...rows.map(([k, x]) => h('tr', {}, h('th', {}, k), h('td', {}, x)))) : null, pins);
}

function kicadRows(k, v) {
  if (!k) return [];
  const link = /^https?:\/\//i.test(k.datasheet || '') ? h('a', { href: k.datasheet, target: '_blank', rel: 'noopener noreferrer', 'data-no-i18n': 'true' }, k.datasheet) : k.datasheet && v(k.datasheet);
  return [['KiCad symbol', v(`${k.symbol} (${k.library})`)], ['Part number', v(k.value)], ['HDL module', k.hdl && v(k.hdl)], ['Datasheet', link], ['Footprint', k.footprint && v(k.footprint)],
    ['Source', k.source && v(k.source)], ['Author', k.author && v(k.author)], ['Licence', k.licence && v(k.licence)]];
}

/** { renderSide } of mountCircuitEditor (M(), sel(): its current values; setM(m) and commit() an edit; status(msg, err)). */
export function mountCircuitSide(ctx) {
  const { M, setM, sel, commit, status, selSection, circBody, readOnly } = ctx;
  const field = (label, input) => h('label', { class: 'asm-field' }, h('span', {}, label), input);
  const apply = (r) => { if (r.error) { status(r.error, true); renderSide(); return; } setM(r.model); commit(); };

  function renderSelection() {
    const s = sel();
    const p = s && M().parts.find((x) => x.id === s.id), w = s && M().wires.find((x) => x.id === s.id);
    if (p) {
      const d = partDef(p.type);
      // (a project's KiCad part drawn only, #4281: its name the file's)
      const kids = [h('h3', d?.kind === 'drawn' ? { 'data-no-i18n': 'true' } : {}, `${p.id}: ${d?.kind === 'drawn' ? d.kicad.value : d?.title ?? p.type}`)];
      if (d?.inputs || d?.lamps || d?.kind === 'probe') {
        const inp = h('input', { type: 'text', class: 'circ-label-in', value: p.label || '', placeholder: p.id, spellcheck: 'false' });
        inp.addEventListener('change', () => apply(setPartProps(M(), p.id, { label: inp.value.trim() })));
        kids.push(field('Label', inp));
      }
      // a switch's position as saved (Try it starts from it), a DIP switch's levers'
      const levels = (d?.inputs || []).filter((x) => x.kind === 'level').length;
      if (levels) {
        const boxes = Array.from({ length: levels }, (_, i) => h('input', { type: 'checkbox', class: 'circ-on-in', checked: levels === 1 ? !!p.on : !!p.on?.[i], title: levels === 1 ? 'On' : `Lever ${i + 1}` }));
        for (const b of boxes) b.addEventListener('change', () => apply(setPartProps(M(), p.id, { on: levels === 1 ? boxes[0].checked : boxes.map((x) => x.checked) })));
        kids.push(field(levels === 1 ? 'On' : 'Levers on', h('span', { class: 'circ-on' }, ...boxes)));
      }
      if (d?.type === 'clock') {
        const hz = h('input', { type: 'number', class: 'circ-hz-in', min: String(CLOCK_HZ.min), max: String(CLOCK_HZ.max), step: '0.1', value: String(p.hz ?? CLOCK_HZ.default) });
        hz.addEventListener('change', () => apply(setPartProps(M(), p.id, { hz: Number(hz.value) })));
        kids.push(field('Frequency (Hz)', hz));
      }
      if (d?.kind === 'output') {
        const c = h('select', { class: 'circ-color-in' }, ...LED_COLORS.map((k) => h('option', { value: k, selected: p.color === k }, k)));
        c.addEventListener('change', () => apply(setPartProps(M(), p.id, { color: c.value })));
        kids.push(field('Colour', c));
      }
      if (d?.dip && d.kind !== 'input' && d.pins.length === d.dip) kids.push(h('div', { class: 'circ-pinout' }, h('div', { class: 'circ-lib-title' }, `${d.kicad?.value ?? (d.chip || d.title)}: pinout`),
        h('table', {}, ...Array.from({ length: d.dip / 2 }, (_, i) => { const a = d.pins[i], b = d.pins[d.dip - 1 - i]; return h('tr', {}, h('td', {}, a.name), h('td', { class: 'n' }, String(a.n)), h('td', { class: 'n' }, String(b.n)), h('td', {}, b.name)); }))));
      if (d) kids.push(infoBlock(partInfo(p.type)));
      if (d?.inputs || d?.lamps) kids.push(h('div', { class: 'circ-note' }, `${d.inputs ? 'Input' : 'Output'} ${portName(p)}${(d.inputs || d.lamps).length > 1 ? '_…' : ''} of the HDL`));
      selSection.replaceChildren(...kids.filter(Boolean));
    } else if (w) {
      const c = h('select', { class: 'circ-color-in' }, ...WIRE_COLORS.map((k) => h('option', { value: k, selected: w.color === k }, k)));
      c.addEventListener('change', () => apply(setWireProps(M(), w.id, { color: c.value })));
      selSection.replaceChildren(h('h3', {}, `Wire ${w.id}`), field('Colour', c));
    } else selSection.replaceChildren();
  }

  function renderCircuit() {
    // (its HDL's language: Source Properties', #4240)
    circBody.replaceChildren(field('Name', h('input', { type: 'text', value: M().name, disabled: true })));
  }

  function renderSide() {
    renderSelection();
    renderCircuit();
    // (a part or a wire selected: its section only, the circuit's hidden, #4303)
    circBody.parentElement.hidden = selSection.childElementCount > 0;
    if (readOnly) for (const x of [selSection, circBody].flatMap((e) => [...e.querySelectorAll('input, select, button')])) x.disabled = true;
  }
  return { renderSide };
}

// The circuit editor's side panel (#3897, docs/CIRCUITS.md): its sections, as every editor's Properties (#2735): the
// parts library (a click on a part, then on the drawing, places it), the selection's (a part's label, an LED's colour,
// an IC's pinout; a wire's colour) and the circuit's (its name, its HDL's language). Its edits are core/circuit-edit.js's.
import { h } from './ui.js';
import { PARTS, PART_ORDER, partDef, LED_COLORS, WIRE_COLORS, CLOCK_HZ } from '/core/circuit-parts.js';
import { setPartProps } from '/core/circuit-edit.js';
import { portName } from '/core/circuit.js';

const GROUPS = [['Breadboards', ['breadboard-half', 'breadboard-full']], ['Power', ['supply', 'pull-up', 'pull-down']],
  ['Inputs', ['logic-switch', 'button', 'spdt', 'dip-4', 'dip-8', 'clock']], ['Outputs', ['led', 'seg7-cc', 'seg7-ca', 'led-bar-10']],
  ['Gates (74LS)', PART_ORDER.filter((t) => PARTS[t].family === 'ttl')], ['Gates (4000)', PART_ORDER.filter((t) => PARTS[t].family === 'cmos')]];

/** { renderSide } of mountCircuitEditor (M(), sel(), tool(): its current values; setM(m) and commit() an edit; status(msg, err)). */
export function mountCircuitSide(ctx) {
  const { M, setM, sel, tool, setTool, commit, status, partsBody, selSection, circBody, readOnly } = ctx;
  const field = (label, input) => h('label', { class: 'asm-field' }, h('span', {}, label), input);
  const apply = (r) => { if (r.error) { status(r.error, true); renderSide(); return; } setM(r.model); commit(); };

  function renderParts() {
    partsBody.replaceChildren(...GROUPS.map(([title, types]) => h('div', { class: 'circ-lib-group' }, h('div', { class: 'circ-lib-title' }, title),
      ...types.map((t) => h('button', { type: 'button', class: `asm-btn circ-lib-part${tool() === `place:${t}` ? ' active' : ''}`, 'data-part': t,
        title: `${PARTS[t].title}: click it, then the drawing (Esc: done)`, onclick: () => setTool(tool() === `place:${t}` ? 'select' : `place:${t}`) }, PARTS[t].chip ? `${t} ${PARTS[t].title}` : PARTS[t].title)))));
  }

  function renderSelection() {
    const s = sel();
    const p = s && M().parts.find((x) => x.id === s.id), w = s && M().wires.find((x) => x.id === s.id);
    if (p) {
      const d = partDef(p.type);
      const kids = [h('h3', {}, `${p.id}: ${d?.title ?? p.type}`)];
      if (d?.inputs || d?.lamps) {
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
      if (d?.dip && d.kind !== 'input') kids.push(h('div', { class: 'circ-pinout' }, h('div', { class: 'circ-lib-title' }, `${d.chip || d.title}: pinout`),
        h('table', {}, ...Array.from({ length: d.dip / 2 }, (_, i) => { const a = d.pins[i], b = d.pins[d.dip - 1 - i]; return h('tr', {}, h('td', {}, a.name), h('td', { class: 'n' }, String(a.n)), h('td', { class: 'n' }, String(b.n)), h('td', {}, b.name)); }))),
        d.tpd ? h('div', { class: 'circ-note' }, `Typical delay ${d.tpd} ns${d.oc ? ', open collector' : ''}`) : null);
      if (d?.inputs || d?.lamps) kids.push(h('div', { class: 'circ-note' }, `${d.inputs ? 'Input' : 'Output'} ${portName(p)}${(d.inputs || d.lamps).length > 1 ? '_…' : ''} of the HDL`));
      selSection.replaceChildren(...kids.filter(Boolean));
    } else if (w) {
      const c = h('select', { class: 'circ-color-in' }, ...WIRE_COLORS.map((k) => h('option', { value: k, selected: w.color === k }, k)));
      c.addEventListener('change', () => { const m = structuredClone(M()); m.wires.find((x) => x.id === w.id).color = c.value; setM(m); commit(); });
      selSection.replaceChildren(h('h3', {}, `Wire ${w.id}`), field('Colour', c));
    } else selSection.replaceChildren();
  }

  function renderCircuit() {
    circBody.replaceChildren(field('Name', h('input', { type: 'text', value: M().name, disabled: true })),
      field('HDL language', h('input', { type: 'text', value: M().lang === 'verilog' ? 'Verilog' : 'VHDL', disabled: true })));
  }

  function renderSide() {
    renderParts();
    renderSelection();
    renderCircuit();
    if (readOnly) for (const x of [partsBody, selSection, circBody].flatMap((e) => [...e.querySelectorAll('input, select, button')])) x.disabled = true;
  }
  return { renderSide };
}

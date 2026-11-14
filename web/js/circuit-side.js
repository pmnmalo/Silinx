// The circuit editor's side panel (#3897, docs/CIRCUITS.md): its sections, as every editor's Properties (#2735): the
// parts library (a click on a part, then on the drawing, places it), the selection's (a part's label, an LED's colour,
// an IC's pinout; a wire's colour) and the circuit's (its name, its HDL's language). Its edits are core/circuit-edit.js's.
import { h } from './ui.js';
import { PARTS, partDef, LED_COLORS, WIRE_COLORS } from '/core/circuit-parts.js';
import { setPartProps } from '/core/circuit-edit.js';
import { portName } from '/core/circuit.js';

const GROUPS = [['Breadboards', ['breadboard-half']], ['Power', ['supply']], ['Inputs', ['logic-switch', 'button']], ['Outputs', ['led']],
  ['Gates (74LS)', ['7400', '7404', '7408', '7432', '7486']]];

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
      if (['logic-switch', 'button', 'led'].includes(p.type)) {
        const inp = h('input', { type: 'text', class: 'circ-label-in', value: p.label || '', placeholder: p.id, spellcheck: 'false' });
        inp.addEventListener('change', () => apply(setPartProps(M(), p.id, { label: inp.value.trim() })));
        kids.push(field('Label', inp));
      }
      if (p.type === 'led') {
        const c = h('select', { class: 'circ-color-in' }, ...LED_COLORS.map((k) => h('option', { value: k, selected: p.color === k }, k)));
        c.addEventListener('change', () => apply(setPartProps(M(), p.id, { color: c.value })));
        kids.push(field('Colour', c));
      }
      if (d?.kind === 'ic') kids.push(h('div', { class: 'circ-pinout' }, h('div', { class: 'circ-lib-title' }, `${d.chip}: pinout`),
        h('table', {}, ...Array.from({ length: d.dip / 2 }, (_, i) => { const a = d.pins[i], b = d.pins[d.dip - 1 - i]; return h('tr', {}, h('td', {}, a.name), h('td', { class: 'n' }, String(a.n)), h('td', { class: 'n' }, String(b.n)), h('td', {}, b.name)); }))),
        h('div', { class: 'circ-note' }, `Typical delay ${d.tpd} ns`));
      if (d?.kind === 'input' || d?.kind === 'output') kids.push(h('div', { class: 'circ-note' }, `${d.kind === 'input' ? 'Input' : 'Output'} ${portName(p)} of the HDL`));
      selSection.replaceChildren(...kids);
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

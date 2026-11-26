// The Board Emulator's analog inputs (#5385, core/emulate-xadc.js): a design with an XADC gets a box of its side panel,
// "Analog inputs (XADC)": its die temperature (°C) and an analog input's voltage (VP / VN or VAUX0..15, 0 to 1 V: a
// potentiometer on the board's analog header), each set while it runs and kept through a power cycle. The event-driven
// engine runs such a design (the compiled one has no model of the XADC).
import { h } from './dom.js';
import { xadcInputs, setXadcInput, XADC_TEMP } from '/core/emulate-xadc.js';

/** { apply() (the values set again: after a power cycle) } | null (no XADC). ctx: { design, sim, side, compiled(), refresh() }. */
export function mountEmuXadc({ design, sim, side, compiled, refresh }) {
  const xs = xadcInputs(design);
  if (!xs.length || compiled()) return null;
  const values = new Map();   // '<instance>:<input>' → its value
  const set = (x, what, v) => { values.set(`${x.path}:${what}`, { x, what, v }); setXadcInput(x, what, v, (sig, val) => sim.force(sig, val)); refresh(); };
  const box = h('div', { class: 'emu-box emu-xadc' }, h('h4', {}, 'Analog inputs (XADC)'));
  for (const x of xs) {
    const temp = h('input', { type: 'number', class: 'emu-xadc-temp', min: String(XADC_TEMP.min), max: String(XADC_TEMP.max), step: '1', value: String(XADC_TEMP.default), 'data-xadc': x.path });
    const which = h('select', { class: 'emu-xadc-in', 'data-xadc': x.path }, h('option', { value: 'vp' }, 'VP / VN'), ...Array.from({ length: 16 }, (_, k) => h('option', { value: `vaux${k}` }, `VAUX${k}`)));
    const knob = h('input', { type: 'range', class: 'emu-xadc-volts', min: '0', max: '1', step: '0.001', value: '0', 'data-xadc': x.path });
    const shown = h('span', { class: 'emu-xadc-v', 'data-no-i18n': '' }, '0.000 V');
    temp.addEventListener('change', () => { if (Number.isFinite(+temp.value)) set(x, 'temp', Math.min(XADC_TEMP.max, Math.max(XADC_TEMP.min, +temp.value))); });
    const knobOf = () => { const v = values.get(`${x.path}:${which.value}`)?.v ?? 0; knob.value = String(v); shown.textContent = `${v.toFixed(3)} V`; };
    which.addEventListener('change', knobOf);
    knob.addEventListener('input', () => { set(x, which.value, +knob.value); shown.textContent = `${(+knob.value).toFixed(3)} V`; });
    box.append(...(xs.length > 1 ? [h('div', { class: 'emu-xadc-name', 'data-no-i18n': '' }, x.path || 'XADC')] : []),
      h('label', { class: 'emu-xadc-row' }, h('span', {}, 'Die temperature (°C)'), temp),
      h('label', { class: 'emu-xadc-row' }, h('span', {}, 'Input'), which), h('div', { class: 'emu-xadc-row' }, knob, shown));
  }
  side.querySelector('.emu-box')?.before(box);
  return { apply() { for (const { x, what, v } of values.values()) setXadcInput(x, what, v, (sig, val) => sim.force(sig, val)); } };
}

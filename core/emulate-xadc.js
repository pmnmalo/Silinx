// Silinx - the Board Emulator's analog inputs (#5385, the analog and digital roadmap #5387): a design's XADC instances
// (its 7-series model, packages/silinx-hdl/src/unisim-xc7.js) and the values of their analog inputs, set as the board's
// would be: the die temperature (°C), VP / VN and VAUX0..15 (V, 0 to 1 V: a potentiometer on the board's analog header, a
// Basys 3's JXADC). The model's signals forced (temp_mc, vp_mv, vaux<k>_mv), as `simulate`'s forces of the MCP server can.
// The compiled engine has no model of the XADC: a design with one runs on the event-driven engine.
//
// Isomorphic ES module (browser + Node), no DOM.
import * as V from './values.js';

export const XADC_TEMP = { min: -40, max: 125, default: 25 };
const XADC_VOLTS = { min: 0, max: 1 };

/** A design's XADC instances: [{ path (its instance's, as the Watch box says it), temp, vp, vaux: [16 signals] }]. */
export function xadcInputs(design) {
  const by = new Map();
  for (const s of design.signals || []) {
    const m = /^(?:(.*)[./])?(temp_mc|vp_mv|vaux(\d+)_mv)$/.exec(s.path || s.name);
    if (!m) continue;
    const key = m[1] ?? '';
    if (!by.has(key)) by.set(key, { path: key, temp: null, vp: null, vaux: [] });
    const x = by.get(key);
    if (m[2] === 'temp_mc') x.temp = s; else if (m[2] === 'vp_mv') x.vp = s; else x.vaux[Number(m[3])] = s;
  }
  return [...by.values()].filter((x) => x.temp && x.vp && x.vaux.filter(Boolean).length === 16);
}

/** An XADC's input set now: `what` 'temp' (°C) or 'vp' or 'vaux<k>' (V), in its range; force(sig, value) the engine's. */
export function setXadcInput(x, what, value, force) {
  const n = Number(value);
  if (what === 'temp') {
    if (!Number.isFinite(n) || n < XADC_TEMP.min || n > XADC_TEMP.max) throw new Error(`the die temperature: from ${XADC_TEMP.min} to ${XADC_TEMP.max} °C`);
    return force(x.temp, V.fromInt(BigInt(Math.round(n * 1000)), 32));
  }
  const m = /^vaux(\d+)$/.exec(what);
  const sig = what === 'vp' ? x.vp : m && Number(m[1]) < 16 ? x.vaux[Number(m[1])] : null;
  if (!sig) throw new Error(`no XADC input '${what}' (temp, vp, vaux0 to vaux15)`);
  if (!Number.isFinite(n) || n < XADC_VOLTS.min || n > XADC_VOLTS.max) throw new Error(`${what}: from ${XADC_VOLTS.min} to ${XADC_VOLTS.max} V`);
  return force(sig, V.fromInt(BigInt(Math.round(n * 1000)), 32));
}

// Silinx - a VCD file read back (#4699): its timescale, its signals by their scopes' path ('system.links.uart_avr_tx')
// and their changes. A bit's value: 0, 1, or null (x, z); a vector's: its binary digits as written ('b1010'). For the
// System's VCD (core/system-waves.js) and the simulator's (toVCD). Isomorphic ES module.

/** A VCD's text read: { timescale, signals: Map(path → { width, type, changes: [t, value, t, value…] }) } or throws. */
export function readVcd(text) {
  const tokens = String(text).split(/\s+/).filter(Boolean);
  const signals = new Map(), byId = new Map(), path = [];
  let timescale = null, i = 0, t = 0;
  const until = () => { const out = []; while (i < tokens.length && tokens[i] !== '$end') out.push(tokens[i++]); i++; return out; };
  const set = (id, v) => { for (const s of byId.get(id) || []) s.changes.push(t, v); };
  const bit = (c) => (c === '0' ? 0 : c === '1' ? 1 : null);
  let defs = true;
  while (i < tokens.length) {
    const tok = tokens[i++];
    if (defs) {
      if (tok === '$timescale') timescale = until().join('');
      else if (tok === '$scope') path.push(until()[1]);
      else if (tok === '$upscope') { path.pop(); until(); }
      else if (tok === '$var') {
        const [type, width, id, name] = until();
        const s = { width: Number(width), type, changes: [] };
        signals.set([...path, name].join('.'), s);
        byId.set(id, [...(byId.get(id) || []), s]);
      } else if (tok === '$enddefinitions') { until(); defs = false; }
      else if (tok.startsWith('$')) until();
      else throw new Error(`not a VCD: '${tok}' before $enddefinitions`);
      continue;
    }
    if (tok.startsWith('#')) { t = Number(tok.slice(1)); if (!Number.isFinite(t)) throw new Error(`not a VCD time: '${tok}'`); }
    else if (/^[bBrR]/.test(tok)) set(tokens[i++], tok.slice(1));
    else if (/^[01xXzZ]/.test(tok)) set(tok.slice(1), bit(tok[0]));
    else if (tok.startsWith('$')) { if (tok !== '$dumpvars' && tok !== '$end') until(); }
    else throw new Error(`not a VCD value: '${tok}'`);
  }
  if (defs) throw new Error('not a VCD: no $enddefinitions');
  return { timescale, signals };
}

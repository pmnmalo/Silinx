// Silinx toolchain - the GateMate's constraints, CCF (#2431), as nextpnr-himbaechel-gatemate reads them (Cologne Chip's format):
// a format of constraints.js's model.
//   Pin_out "led[0]" Loc = "IO_EB_B1" | DRIVE=3 | SLEW=slow;   a port's pin and its settings (NET, Pin_in, Pin_out, Pin_inout)
//   Pin_in  "btn"    Loc = "IO_EB_B0" | PULLUP=true;          its pull: PULLUP, PULLDOWN or KEEPER =true
//   # create_clock -period 100.000 [get_ports {clk}]           a clock's period: Silinx's, in a comment (a CCF has none), given to
//                                                              nextpnr in an SDC (--sdc)
// '#' starts a comment, ';' ends a statement (it may span lines); the keywords' case does not matter. The names are nextpnr's
// (led[0]). Another statement throws, naming its line: nextpnr would not apply it.
import { byName, periodNs, setByName } from './ucf.js';

const KINDS = ['NET', 'PIN_IN', 'PIN_OUT', 'PIN_INOUT'];
const PULL_KEYS = { PULLUP: 'up', PULLDOWN: 'down', KEEPER: 'keeper' };
const PULL_OF = { up: 'PULLUP', down: 'PULLDOWN', keeper: 'KEEPER' };
// (on a line trimmed and its ';' cut: no blanks both sides of an optional ';', quadratic on a long line, #4587)
const CLOCK = /^#\s*create_clock\s+(?:-name\s+\S+\s+)?-period\s+([\d.]+)\s+\[get_ports\s+\{?([^\s}\]]+)\}?\]$/;

const notCcf = verb => `${verb}: not a CCF statement nextpnr-himbaechel-gatemate applies (NET, Pin_in, Pin_out, Pin_inout)`;
const isTrue = v => /^(true|1)$/i.test(v);
// a line's clock comment (CLOCK's match), or null
const clockOf = raw => { const t = raw.trim(); return CLOCK.exec(t.endsWith(';') ? t.slice(0, -1).trimEnd() : t); };

// the statements of a text: [{ text, line }] (a clock's comment one too, { clock }), comments out, ';' their end
function statements(text) {
  const out = [];
  let cur = '', start = 0;
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const clock = clockOf(raw);
    if (clock) { out.push({ clock, line: i + 1 }); return; }
    let rest = raw.replace(/#.*$/s, '');   // (the s flag: linear on a long line, CodeQL's js/polynomial-redos, #3663)
    for (;;) {
      const k = rest.indexOf(';');
      if (k < 0) break;
      if (!cur.trim()) start = i + 1;
      cur += ` ${rest.slice(0, k)}`;
      if (cur.trim()) out.push({ text: cur.trim(), line: start });
      cur = ''; rest = rest.slice(k + 1);
    }
    if (rest.trim()) { if (!cur.trim()) start = i + 1; cur += ` ${rest}`; }
  });
  if (cur.trim()) out.push({ text: cur.trim(), line: start, open: true });
  return out;
}

function readCcf(text) {
  const assignments = {}, netStatements = [], clocks = [];
  for (const s of statements(text)) {
    const fail = msg => { throw new Error(`line ${s.line}: ${msg}`); };
    if (s.clock) {
      if (!(+s.clock[1] > 0)) fail('create_clock needs a period in ns');
      clocks.push({ net: s.clock[2], period: +s.clock[1] });
      continue;
    }
    if (s.open) fail(`${s.text.split(/\s+/)[0]}: no ';' at its end`);
    const [head, ...params] = s.text.split('|').map(p => p.trim());
    const m = /^(\w+)\s+"([^"]+)"\s*(.*)$/s.exec(head);
    if (!m) fail(notCcf(head.split(/\s+/)[0] || '|'));
    if (!KINDS.includes(m[1].toUpperCase())) fail(notCcf(m[1]));
    const attrs = {};
    const loc = /^Loc\s*=\s*"([^"]+)"$/i.exec(m[3]);
    if (m[3] && !loc) fail(`${m[1]} "${m[2]}": Loc = "<pin>" expected, not ${m[3]}`);
    if (loc) attrs.loc = loc[1];
    for (const p of params) {
      const kv = /^(\w+)\s*=\s*"?([^"\s]+)"?$/.exec(p);
      if (!kv) fail(`${m[1]} "${m[2]}": ${p} is not KEY=VALUE`);
      const key = kv[1].toUpperCase();
      if (key === 'LOC') attrs.loc = kv[2];
      else if (key in PULL_KEYS) { if (isTrue(kv[2])) attrs.pull = PULL_KEYS[key]; }
      else if (key === 'DRIVE') attrs.drive = kv[2];
      else if (key === 'SLEW') attrs.slew = kv[2].toLowerCase();
      else attrs.ccf = { ...attrs.ccf, [key]: kv[2] };
    }
    netStatements.push({ net: m[2], attrs: { ...attrs }, line: s.line });
    setByName(assignments, m[2], { ...byName(assignments, m[2]), ...attrs });
  }
  return { assignments, netStatements, clocks, other: [] };
}

const q = s => `"${s}"`;
function writeCcf({ assignments = {}, clocks = [] }) {
  const lines = [];
  for (const [net, a] of Object.entries(assignments)) {
    const params = [a?.pull && `${PULL_OF[a.pull]}=true`, a?.drive && `DRIVE=${a.drive}`, a?.slew && `SLEW=${a.slew}`,
      ...Object.entries(a?.ccf || {}).map(([k, v]) => `${k}=${v}`)].filter(Boolean);
    if (!a?.loc && !params.length) continue;
    lines.push(`NET ${q(net)}${a?.loc ? ` Loc = ${q(a.loc)}` : ''}${params.map(p => ` | ${p}`).join('')};`);
  }
  for (const c of clocks) lines.push(`# create_clock -period ${periodNs(c.period).toFixed(3)} [get_ports {${c.net}}]`);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

export const CCF = { id: 'ccf', read: text => readCcf(text), write: writeCcf, comment: '#' };

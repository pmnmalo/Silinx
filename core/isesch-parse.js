// Xilinx ISE schematic (.sch) and symbol (.sym) files read into core/isesch.js's neutral model: the XML of ISE 14.x and
// the text format of older versions (VERSION 6), moved from core/isesch.js (#4765; the model: its header).
import { ISE_GRAPHIC_TAGS, iseGraphic } from './isesch-graphics.js';
import { attrPairs } from './xml-attrs.js';

export function parseXml(text) {
  const src = String(text ?? '');
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const n = src.length;
  const top = () => stack[stack.length - 1];
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { top().text += decodeEnt(src.slice(i)); break; }
    if (lt > i) top().text += decodeEnt(src.slice(i, lt));
    i = lt;
    if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', i)) { const e = src.indexOf(']]>', i + 9); top().text += src.slice(i + 9, e < 0 ? n : e); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<?', i)) { const e = src.indexOf('?>', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith('<!', i)) { const e = src.indexOf('>', i + 2); i = e < 0 ? n : e + 1; continue; }
    if (src[i + 1] === '/') {
      const e = src.indexOf('>', i + 2);
      const name = src.slice(i + 2, e < 0 ? n : e).trim().toLowerCase();
      i = e < 0 ? n : e + 1;
      // pop to the matching element (tolerate stray / missing close tags)
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === name) { stack.length = k; break; }
      continue;
    }
    // start tag: scan respecting quotes
    let j = i + 1, q = null;
    while (j < n) { const c = src[j]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; j++; }
    let body = src.slice(i + 1, j);
    i = j + 1;
    const selfClose = /\/\s*$/.test(body);
    if (selfClose) body = body.replace(/\/\s*$/, '');
    const m = /^\s*([^\s/>]+)/.exec(body);
    if (!m) continue;
    const el = { tag: m[1].toLowerCase(), attrs: {}, children: [], text: '' };
    for (const [k, v] of attrPairs(body.slice(m[0].length))) el.attrs[k] = decodeEnt(v);   // (in one pass, #3557)
    top().children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}
function decodeEnt(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e) => {
    const l = e.toLowerCase();
    if (l === 'lt') return '<'; if (l === 'gt') return '>'; if (l === 'amp') return '&'; if (l === 'quot') return '"'; if (l === 'apos') return "'";
    const cp = l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : '\uFFFD';   // (past Unicode, &#x110000; on: U+FFFD, #3557)
  });
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const kids = (el, tag) => (el?.children || []).filter(c => c.tag === tag);
const kid = (el, tag) => (el?.children || []).find(c => c.tag === tag);

// .sch text (version 7 XML or legacy VERSION 6 text) -> neutral model
export function parseIseSch(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  if (/^\s*VERSION\s+\d/i.test(src) || /^\s*BEGIN\s+SCHEMATIC/im.test(src.slice(0, 400))) return parseV6(src);
  const root = parseXml(src);
  const dr = kid(root, 'drawing');
  if (!dr) throw new Error('not an ISE schematic (no <drawing> element)');
  const m = emptyModel(num(dr.attrs.version) || 7);
  for (const a of kids(dr, 'attr')) m.attrs[a.attrs.name] = a.attrs.value;
  const nl = kid(dr, 'netlist') || { children: [] };
  for (const s of kids(nl, 'signal')) m.signals.push({ name: s.attrs.name, attrs: attrMap(s) });
  for (const p of kids(nl, 'port')) m.ports.push({ name: p.attrs.name, polarity: p.attrs.polarity || 'Input' });
  for (const b of kids(nl, 'blockdef')) {
    const def = { name: b.attrs.name, timestamp: kid(b, 'timestamp')?.text?.trim() || '', shapes: [] };
    for (const c of b.children) {
      const A = c.attrs;
      const bus = /linewidth\s*:\s*W/i.test(A.style || '');
      if (c.tag === 'line') def.shapes.push({ kind: 'line', x1: num(A.x1), y1: num(A.y1), x2: num(A.x2), y2: num(A.y2), bus });
      else if (c.tag === 'rect') def.shapes.push({ kind: 'rect', x: num(A.x), y: num(A.y), w: num(A.width), h: num(A.height) });
      else if (c.tag === 'circle') def.shapes.push({ kind: 'circle', cx: num(A.cx), cy: num(A.cy), r: num(A.r) });
      else if (c.tag === 'arc') def.shapes.push({ kind: 'arc', cx: num(A.cx), cy: num(A.cy), r: num(A.r), sx: num(A.sx), sy: num(A.sy), ex: num(A.ex), ey: num(A.ey) });
      else if (c.tag === 'text' || c.tag === 'attrtext') def.shapes.push({ kind: 'text', x: num(A.x), y: num(A.y), text: c.text?.trim() || A.attrname || '' });
    }
    m.blockdefs.set(def.name.toLowerCase(), def);
  }
  for (const b of kids(nl, 'block')) {
    m.blocks.push({ symbol: b.attrs.symbolname, name: b.attrs.name, attrs: attrMap(b),
      pins: kids(b, 'blockpin').map(p => ({ name: p.attrs.name, signal: p.attrs.signalname ?? null })) });
  }
  for (const sh of kids(dr, 'sheet')) {
    const S = { num: num(sh.attrs.sheetnum) || 1, width: num(sh.attrs.width) || 3520, height: num(sh.attrs.height) || 2720, instances: [], branches: [], iomarkers: [], bustaps: [], graphics: [] };
    for (const c of sh.children) {
      const A = c.attrs;
      if (c.tag === 'instance') S.instances.push({ name: A.name, x: num(A.x), y: num(A.y), orien: A.orien || 'R0' });
      else if (c.tag === 'branch') {
        S.branches.push({ name: A.name, wires: kids(c, 'wire').map(w => [num(w.attrs.x1), num(w.attrs.y1), num(w.attrs.x2), num(w.attrs.y2)]),
          labels: kids(c, 'attrtext').filter(t => !t.attrs.attrname || /^name$/i.test(t.attrs.attrname)).map(t => ({ x: num(t.attrs.x), y: num(t.attrs.y), style: t.attrs.style || '' })) });
      } else if (c.tag === 'iomarker') S.iomarkers.push({ name: A.name, x: num(A.x), y: num(A.y), orien: A.orien || 'R0' });
      else if (c.tag === 'bustap') S.bustaps.push({ x1: num(A.x1), y1: num(A.y1), x2: num(A.x2), y2: num(A.y2) });
      else if (ISE_GRAPHIC_TAGS.has(c.tag)) S.graphics.push(iseGraphic(c.tag, A, c.text));
    }
    m.sheets.push(S);
  }
  return m;
}
// ISE symbol file (.sym): XML (ISE 9+) or VERSION 5 text -> { name, pins: [{ name, dir, x, y }] }
export function parseIseSym(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const dirOf = p => (/^out/i.test(p) ? 'out' : /^bi|inout/i.test(p) ? 'inout' : 'in');
  if (/^\s*VERSION\s+\d/i.test(src) || /^\s*BEGIN\s+SYMBOL/im.test(src.slice(0, 200))) {
    const out = { name: (/BEGIN\s+SYMBOL\s+(\S+)/.exec(src) || [])[1] || '', pins: [] };
    // (no line end before SYMPIN: \s* went over the blank lines after each line's start, #3557)
    for (const m of src.matchAll(/^[^\S\n\r\u2028\u2029]*SYMPIN\s+(-?\d+)\s+(-?\d+)\s+(\w+)\s+(\S+)/gm)) out.pins.push({ name: m[4], dir: dirOf(m[3]), x: +m[1], y: +m[2] });
    return out;
  }
  const root = parseXml(src);
  const sym = kid(root, 'symbol');
  if (!sym) throw new Error('not an ISE symbol (no <symbol> element)');
  return { name: sym.attrs.name || '', pins: kids(sym, 'pin').map(p => ({ name: p.attrs.name, dir: dirOf(p.attrs.polarity || 'Input'), x: num(p.attrs.x), y: num(p.attrs.y) })) };
}
function emptyModel(version) { return { version, attrs: {}, signals: [], ports: [], blockdefs: new Map(), blocks: [], sheets: [] }; }
function attrMap(el) { const o = {}; for (const a of kids(el, 'attr')) if (a.attrs.name) o[a.attrs.name] = a.attrs.value ?? ''; return o; }

function v6tokens(line) {
  const out = [];
  const re = /"((?:[^"]|"")*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] != null ? m[1].replace(/""/g, '"') : m[2]);
  return out;
}
function parseV6(src) {
  const lines = src.split(/\r?\n/).map(v6tokens).filter(t => t.length);
  const m = emptyModel(6);
  let i = 0;
  const N = lines.length;
  const isBegin = (t, w) => t[0] === 'BEGIN' && t[1] === w;
  const skipBlock = () => { let d = 0; for (; i < N; i++) { const t = lines[i]; if (t[0] === 'BEGIN') d++; else if (t[0] === 'END') { d--; if (d <= 0) { i++; return; } } } };
  // collect ATTR name value at the current block level
  while (i < N) {
    const t = lines[i];
    if (t[0] === 'VERSION') { m.version = num(t[1]) || 6; i++; continue; }
    if (isBegin(t, 'SCHEMATIC') || (t[0] === 'END' && t[1] === 'SCHEMATIC')) { i++; continue; }
    if (isBegin(t, 'ATTR')) { m.attrs[t[2]] = t[3] ?? ''; skipBlock(); continue; }
    if (isBegin(t, 'NETLIST')) { i++; continue; }
    if (t[0] === 'END' && (t[1] === 'NETLIST')) { i++; continue; }
    if (t[0] === 'SIGNAL') { m.signals.push({ name: t[1], attrs: {} }); i++; continue; }
    if (isBegin(t, 'SIGNAL')) {
      const s = { name: t[2], attrs: {} }; i++;
      while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'SIGNAL')) { const u = lines[i]; if (isBegin(u, 'ATTR')) { s.attrs[u[2]] = u[3] ?? ''; skipBlock(); continue; } if (u[0] === 'BEGIN') { skipBlock(); continue; } i++; }
      i++; m.signals.push(s); continue;
    }
    if (t[0] === 'PORT') { m.ports.push({ polarity: t[1], name: t[2] }); i++; continue; }
    if (isBegin(t, 'BLOCKDEF')) {
      const def = { name: t[2], timestamp: '', shapes: [] }; i++;
      while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'BLOCKDEF')) {
        const u = lines[i];
        const f = u.slice(2).map(num);
        if (u[0] === 'TIMESTAMP') { const [y, mo, d, h, mi, s] = u.slice(1); def.timestamp = `${y}-${mo}-${d}T${h}:${mi}:${s}`; }
        else if (u[0] === 'LINE') def.shapes.push({ kind: 'line', x1: f[0], y1: f[1], x2: f[2], y2: f[3], bus: u[1] === 'W' });
        else if (isBegin(u, 'LINE')) { const g = u.slice(3).map(num); def.shapes.push({ kind: 'line', x1: g[0], y1: g[1], x2: g[2], y2: g[3], bus: u[2] === 'W' }); skipBlock(); continue; }
        else if (u[0] === 'RECTANGLE') def.shapes.push({ kind: 'rect', x: Math.min(f[0], f[2]), y: Math.min(f[1], f[3]), w: Math.abs(f[2] - f[0]), h: Math.abs(f[3] - f[1]) });
        else if (u[0] === 'CIRCLE') def.shapes.push({ kind: 'circle', cx: (f[0] + f[2]) / 2, cy: (f[1] + f[3]) / 2, r: Math.abs(f[2] - f[0]) / 2 });
        else if (u[0] === 'ARC') { const cx = (f[0] + f[2]) / 2, cy = (f[1] + f[3]) / 2; def.shapes.push({ kind: 'arc', cx, cy, r: Math.abs(f[2] - f[0]) / 2, sx: f[4], sy: f[5], ex: f[6], ey: f[7] }); }
        else if (u[0] === 'BEGIN') { skipBlock(); continue; }
        i++;
      }
      i++; m.blockdefs.set(def.name.toLowerCase(), def); continue;
    }
    if (isBegin(t, 'BLOCK')) {
      const b = { name: t[2], symbol: t[3], attrs: {}, pins: [] }; i++;
      while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'BLOCK')) {
        const u = lines[i];
        if (u[0] === 'PIN') b.pins.push({ name: u[1], signal: u[2] ?? null });
        else if (isBegin(u, 'ATTR')) { b.attrs[u[2]] = u[3] ?? ''; skipBlock(); continue; }
        else if (u[0] === 'BEGIN') { skipBlock(); continue; }
        i++;
      }
      i++; m.blocks.push(b); continue;
    }
    if (isBegin(t, 'SHEET')) {
      const S = { num: num(t[2]) || 1, width: num(t[3]) || 3520, height: num(t[4]) || 2720, instances: [], branches: [], iomarkers: [], bustaps: [], graphics: [] };
      i++;
      while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'SHEET')) {
        const u = lines[i];
        if (u[0] === 'INSTANCE') { S.instances.push({ name: u[1], x: num(u[2]), y: num(u[3]), orien: u[4] || 'R0' }); i++; continue; }
        if (isBegin(u, 'INSTANCE')) { S.instances.push({ name: u[2], x: num(u[3]), y: num(u[4]), orien: u[5] || 'R0' }); skipBlock(); continue; }
        if (isBegin(u, 'BRANCH')) {
          const br = { name: u[2], wires: [], labels: [] }; i++;
          while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'BRANCH')) {
            const w = lines[i];
            if (w[0] === 'WIRE') { br.wires.push(w.slice(1, 5).map(num)); i++; continue; }
            if (isBegin(w, 'DISPLAY')) { if (w[4] === 'ATTR' && /^name$/i.test(w[5] || '')) br.labels.push({ x: num(w[2]), y: num(w[3]), style: '' }); skipBlock(); continue; }
            if (w[0] === 'BEGIN') { skipBlock(); continue; }
            i++;
          }
          i++; S.branches.push(br); continue;
        }
        if (u[0] === 'IOMARKER') { S.iomarkers.push({ x: num(u[1]), y: num(u[2]), name: u[3], orien: u[4] || 'R0' }); i++; continue; }
        if (u[0] === 'BUSTAP') { S.bustaps.push({ x1: num(u[1]), y1: num(u[2]), x2: num(u[3]), y2: num(u[4]) }); i++; continue; }
        if (isBegin(u, 'DISPLAY') && u[4] === 'TEXT') { S.graphics.push({ kind: 'text', x: num(u[2]), y: num(u[3]), text: u.slice(5).join(' ') }); skipBlock(); continue; }
        if (u[0] === 'BEGIN') { skipBlock(); continue; }
        i++;
      }
      i++; m.sheets.push(S); continue;
    }
    if (t[0] === 'BEGIN') { skipBlock(); continue; }
    i++;
  }
  return m;
}

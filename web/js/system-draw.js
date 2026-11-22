// The System editor's drawing (#4700, web/js/system-editor.js): a co-design project's System drawn on its SVG, the
// nodes as boxes (their id, what they are: an FPGA node's module and board, a microcontroller's board and firmware, a
// serial terminal), each interface a row with its pin dot on the side of the node it is linked to, the links between
// the dots (a UART's line, GPIO's dashed), the link being drawn; the view's transform and the status line's counts.
import { mcuBoard } from '/core/system-doc.js';
import { BOARDS } from '/core/devices.js';
import { sv } from './dom.js';
import { t } from './i18n.js';

/** A node's box: its width, its header's height, an interface row's height. */
export const NODE_W = 200, HEAD_H = 40, ROW_H = 22;
export const nodeHeight = n => HEAD_H + Math.max(1, n.interfaces.length) * ROW_H + 6;
const boardName = id => BOARDS.find(b => b.id === id)?.name || id || t('no board');

/** What a node is, in a few words (its box's second line: SVG text, translated as it is drawn). */
function nodeText(n) {
  if (n.kind === 'fpga') return `${n.module || t('no module')} · ${boardName(n.board)}${n.variant ? `-${n.variant}` : ''}`;
  if (n.kind === 'mcu') return `${mcuBoard(n.board)?.name || n.board} · ${n.firmware ? n.firmware.split('/').pop() : t('no firmware')}`;
  return t('Serial terminal');
}
const ifaceText = f => (f.kind === 'uart' ? `${f.name} · UART ${f.baud} ${f.frame}` : f.kind === 'spi' ? `${f.name} · SPI ${f.hz / 1000} kHz mode ${f.mode}` : f.kind === 'i2c' ? `${f.name} · I²C ${f.hz / 1000} kHz` : `${f.name} · GPIO ${f.dir} ${f.pins.length}`);

/** { applyView, render, toWorld, dotOf } of mountSystemEditor (M(), sel(), linkFrom(), drag(), view(): its values). */
export function mountSystemDraw(ctx) {
  const { M, sel, linkFrom, drag, view, svg, world, zoomLbl, info, delBtn, renderSide, destroyed } = ctx;
  const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view().tx) / view().k, y: (cy - r.top - view().ty) / view().k }; };
  const applyView = () => { world.setAttribute('transform', `translate(${view().tx},${view().ty}) scale(${view().k})`); zoomLbl.textContent = `${Math.round(view().k * 100)}%`; };
  const nodeOf = id => M().nodes.find(n => n.id === id);
  // the other end's node of an interface's link (its dot on that side), or null
  const towards = (n, f) => {
    const end = `${n.id}.${f.name}`;
    const l = M().links.find(x => x.a === end || x.b === end);
    return l ? nodeOf((l.a === end ? l.b : l.a).split('.')[0]) : null;
  };
  /** An interface's dot ({ x, y }): on the side of the node it is linked to (the right when it is not linked). */
  function dotOf(n, f) {
    const i = n.interfaces.indexOf(f), o = towards(n, f);
    const left = o && o.x + NODE_W / 2 < n.x + NODE_W / 2;
    return { x: left ? n.x : n.x + NODE_W, y: n.y + HEAD_H + i * ROW_H + ROW_H / 2, left };
  }
  const endDot = e => { const [id, name] = e.split('.'); const n = nodeOf(id); const f = n?.interfaces.find(x => x.name === name); return f ? dotOf(n, f) : null; };
  function render() {
    if (destroyed()) return;
    applyView();
    world.replaceChildren();
    const s = sel();
    for (const l of M().links) {
      const p = endDot(l.a), q = endDot(l.b);
      if (!p || !q) continue;
      const bend = Math.max(40, Math.abs(q.x - p.x) / 2);
      const d = `M${p.x},${p.y} C${p.x + (p.left ? -bend : bend)},${p.y} ${q.x + (q.left ? -bend : bend)},${q.y} ${q.x},${q.y}`;
      const isSel = s?.kind === 'link' && s.id === l.id;
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 - 6 };
      world.append(sv('g', { class: `sys-link ${l.kind}${isSel ? ' sel' : ''}`, 'data-kind': 'link', 'data-id': l.id },
        sv('path', { d, class: 'sys-link-hit' }), sv('path', { d, class: 'sys-link-line' }),
        sv('text', { x: mid.x, y: mid.y, 'text-anchor': 'middle', class: 'sys-link-name' }, l.id)));
    }
    const from = linkFrom(), g0 = drag();
    if (from && g0?.kind === 'linkdraw') { const p = endDot(from); if (p) world.append(sv('line', { x1: p.x, y1: p.y, x2: g0.x, y2: g0.y, class: 'sys-link-line sys-ghost' })); }
    for (const n of M().nodes) {
      const isSel = s?.kind === 'node' && s.id === n.id;
      const g = sv('g', { class: `sys-node ${n.kind}${isSel ? ' sel' : ''}`, 'data-kind': 'node', 'data-id': n.id });
      g.append(sv('rect', { x: n.x, y: n.y, width: NODE_W, height: nodeHeight(n), rx: 6, class: 'sys-box' }),
        sv('rect', { x: n.x, y: n.y, width: NODE_W, height: HEAD_H - 4, rx: 6, class: 'sys-head' }),
        sv('text', { x: n.x + 10, y: n.y + 16, class: 'sys-id' }, n.id),
        sv('text', { x: n.x + 10, y: n.y + 30, class: 'sys-what' }, nodeText(n)));
      n.interfaces.forEach((f, i) => {
        const y = n.y + HEAD_H + i * ROW_H, dot = dotOf(n, f), end = `${n.id}.${f.name}`;
        const on = (s?.kind === 'iface' && s.id === end) || from === end;
        g.append(sv('g', { class: `sys-iface${on ? ' sel' : ''}`, 'data-kind': 'iface', 'data-id': end },
          sv('rect', { x: n.x + 2, y, width: NODE_W - 4, height: ROW_H, class: 'sys-iface-row' }),
          sv('text', { x: dot.left ? n.x + 14 : n.x + 10, y: y + 15, class: 'sys-iface-name' }, ifaceText(f)),
          sv('circle', { cx: dot.x, cy: dot.y, r: 5, class: `sys-dot ${f.kind}` })));
      });
      if (!n.interfaces.length) g.append(sv('text', { x: n.x + 10, y: n.y + HEAD_H + 15, class: 'sys-none' }, t('no interface')));
      world.append(g);
    }
    renderSide();
    delBtn.disabled = !s;
    const c = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    info.set([{ text: `${c(M().nodes.length, 'node', 'nodes')} · ${c(M().links.length, 'link', 'links')}`, cls: 'asm-info' }]);
  }
  return { applyView, render, toWorld, dotOf };
}

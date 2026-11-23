// Usability tests (#5206, phase 5): I/O Pin Planning's kit for a session (lib/session.js): its document the pins as
// the table shows them (each port bit's Site (LOC) and its clock's period, the status line's count), its actions a
// person's: Tools ▸ I/O Pin Planning, its Table and Board views, Clear All, a port dragged from the Ports panel onto a
// part of the board or a row of Board Resources, a pin typed in a bit's Site (LOC), Edit ▸ Undo / Redo; and the
// flow's Process ▸ Implement Top Module, to its end. Its invariants: the status line counts the bits with a pin, a pin
// given to two bits is marked on both rows (and only such a pin), the Board view's parts show the bits on their pins.
import { tr } from './hdl-actions.js';

const PP = '.doc:not([hidden]) .pin-planner';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// (the flow's processes, Process ▸ Implement Top Module's)
export const FLOW = ['synth', 'translate', 'map', 'par', 'impl', 'bitgen'];

/** The planner's table: { pins: { net: LOC }, periods: { net: period }, conflicts: [net], status }. */
const tableOf = (page) => page.eval((p) => {
  const rows = [...document.querySelectorAll(`${p} .pp-table tr`)].slice(1);
  const pins = {}, periods = {}, conflicts = [];
  for (const r of rows) {
    const net = r.cells[0].textContent;
    pins[net] = r.cells[3].querySelector('input').value;
    const per = r.cells[8].querySelector('input').value;
    if (per) periods[net] = per;
    if (r.cells[3].classList.contains('conflict')) conflicts.push(net);
  }
  return { pins, periods, conflicts, status: document.querySelector(`${p} .pp-status`).textContent };
}, PP);

export function pinActions(page) {
  const L = (list) => tr(page, list);
  const a = {
    /** Tools ▸ I/O Pin Planning: its table (`nets` rows) in front. */
    async open(nets) {
      const [toolsL, ppL] = await L(['Tools', 'I/O Pin Planning']);
      await page.menu(toolsL, ppL);
      await page.waitFor((p, n) => window.Silinx.active?.id === 'pins' && document.querySelectorAll(`${p} .pp-table tr`).length === n + 1, [PP, nets], { what: 'I/O Pin Planning' });
    },
    /** The document: the table's (its view shown or not), the pins of the board's parts as the Board view titles them. */
    getDoc: () => tableOf(page),
    /** A view of its toolbar: 'Table' or 'Board'. */
    async view(which) {
      const [label] = await L([which]);
      await page.click(`${PP} .pp-bar .pp-view`, { text: label });
      if (which === 'Board') await page.waitFor((p) => !!document.querySelector(`${p} .pp-board .emu-pcb [data-part="sw0"].pp-target`), [PP], { what: 'the board' });
    },
    /** Clear All of its toolbar. */
    async clearAll() { const [label] = await L(['Clear All']); await page.click(`${PP} .pp-bar .asm-btn`, { text: label }); },
    /** A port (or a bit: its net) dragged from the Ports panel onto `target` (a part, '[data-part="led0"]'; a row of
     *  Board Resources, '.pp-res .res[data-res="mclk"]'), both scrolled into view first. */
    async drag(from, target) {
      const [p0, p1] = await page.eval((p, f, t) => {
        const to = document.querySelector(`${p} ${t}`);
        to.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const el = document.querySelector(`${p} .pp-ports-side ${/</.test(f) ? `.pp-bit[data-net="${f}"]` : `.pp-port[data-port="${f}"]`}`);
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect(), q = to.getBoundingClientRect();
        return [{ x: r.left + r.width / 3, y: r.top + r.height / 2 }, { x: q.left + q.width / 2, y: q.top + q.height / 2 }];
      }, PP, from, target);
      await page.drag(p0, p1);
    },
    /** A pin typed in a bit's Site (LOC) of the table (its text selected first), Tab to the next field. */
    async typeLoc(net, loc) {
      const i = await page.eval((p, n) => [...document.querySelectorAll(`${p} .pp-table tr`)].slice(1).findIndex((r) => r.cells[0].textContent === n), PP, net);
      await page.click(`${PP} .pp-table tr td:nth-child(4) input`, { index: i });
      await page.eval((p, k) => document.querySelectorAll(`${p} .pp-table tr td:nth-child(4) input`)[k].select(), PP, i);
      await page.type(loc);
      await page.key('Tab');
    },
    /** The Board view's parts with a bit on them, as their tips say ('led<0> (M5): led<0>'). */
    parts: () => page.eval((p) => [...document.querySelectorAll(`${p} .pp-board [data-part].pp-on`)].map((e) => e.title).filter(Boolean), PP),
    /** Saved: the tab's mark gone (the planner saves itself after a change). */
    saved: () => page.waitFor(() => !window.SilinxApp.findDoc('pins')?.tab.classList.contains('dirty'), [], { what: 'I/O Pin Planning saved', timeout: 15000 }),
    async undo() { const [e, u] = await L(['Edit', 'Undo']); await page.menu(e, u); },
    async redo() { const [e, r] = await L(['Edit', 'Redo']); await page.menu(e, r); },

    /** Process ▸ Implement Top Module, to its end (no process running for a second): the processes' states. */
    async implement() {
      const [procL, implL] = await L(['Process', 'Implement Top Module']);
      await page.menu(procL, implL);
      await page.waitFor(() => !!document.querySelector('.proc-running, .running') || Object.values(window.SilinxApp.S.status).includes('running'), [], { what: 'the implementation started', timeout: 30000 }).catch(() => {});
      for (let quiet = 0; quiet < 10;) {
        await sleep(150);
        const busy = await page.eval(() => !!document.querySelector('.proc-running, .running') || Object.values(window.SilinxApp.S.status).includes('running'));
        quiet = busy ? 0 : quiet + 1;
      }
      return page.eval((st) => st.map((k) => window.SilinxApp.S.status[k] ?? null), FLOW);
    },
  };
  return a;
}

/** What is wrong with the planner's table: its status line's count, the pins marked as given twice. */
export function pinInvariants(d) {
  const out = [], n = Object.keys(d.pins).length, set = Object.values(d.pins).filter(Boolean).length;
  // (its count, in the page's language: '3/27 I/Os assigned', '3/27 E/S atribuídas')
  if (!d.status.startsWith(`${set}/${n} `)) out.push(`the status line '${d.status}', ${set}/${n} expected`);
  const by = {};
  for (const [net, loc] of Object.entries(d.pins)) if (loc) (by[loc.toUpperCase()] ||= []).push(net);
  const twice = Object.values(by).filter((x) => x.length > 1).flat().sort();
  if (JSON.stringify([...d.conflicts].sort()) !== JSON.stringify(twice)) out.push(`the pins marked as given twice: ${JSON.stringify(d.conflicts)}, ${JSON.stringify(twice)} expected`);
  return out;
}

/** I/O Pin Planning's kit. */
export const PIN_KIT = {
  actions: pinActions,
  invariants: (d) => { const w = pinInvariants(d); return w.length ? { 'the pins': w } : {}; },
  hdlErrors: () => [], detached: () => [], dangling: () => [],
};

/** A UCF's pins and its clocks' periods: { pins: { net: LOC }, periods: { net: 'n ns' } } (a TIMESPEC's PERIOD on
 *  its TNM_NET's net, or a NET's own PERIOD). */
export function ucfPins(text) {
  const pins = {}, periods = {}, tnm = {};
  for (const [, n, l] of text.matchAll(/NET\s+"([^"]+)"\s+LOC\s*=\s*"?([A-Z0-9]+)"?/gi)) pins[n] = l.toUpperCase();
  for (const [, n, t] of text.matchAll(/NET\s+"([^"]+)"\s+TNM_NET\s*=\s*"?([\w]+)"?/gi)) tnm[t] = n;
  for (const [, t, p] of text.matchAll(/TIMESPEC\s+"?\w+"?\s*=\s*PERIOD\s+"?(\w+)"?\s+([\d.]+\s*ns)/gi)) if (tnm[t]) periods[tnm[t]] = p.replace(/\s+/, ' ');
  for (const [, n, p] of text.matchAll(/NET\s+"([^"]+)"\s+PERIOD\s*=\s*([\d.]+\s*ns)/gi)) periods[n] = p.replace(/\s+/, ' ');
  return { pins, periods };
}

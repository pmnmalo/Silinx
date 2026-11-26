// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The Board Emulator's modules on a board's headers (#5641): a board that lacks a display, LEDs or switches an example
// needs (the Zybo Z7, the Arty Z7, the Arty S7) has its constraints put those ports on its free header pins (group
// 'Headers', its Pmods: packages/silinx-fpga/src/ucf.js onHeaders, #3709). Read from the design's assignments, each kind
// of port there (led, sw, btn, seg, dp, an, vga_*) becomes a resource of the board the emulator wires and draws, as
// if a module were plugged into those pins (a Pmod of LEDs, of switches, a 7-segment display, a VGA connector), the
// Pmods it is on named. The board's own resources stay as they are.
//
// Isomorphic ES module (browser + Node), no DOM.
import { portBits } from './emulate.js';

// a port's kind by its name (as the constraints' auto-assignment reads it, ucf.js's ALIASES), and the module it makes:
// its resource's name, label, group, direction and active level (the examples' defaults: segments and digit enables
// active low, AN_LOW true, as with no display on the board; LEDs, switches and buttons active high)
const KINDS = {
  led: { name: 'pmod_led', label: 'LEDs', group: 'LEDs', dir: 'out', extra: { activeHigh: true } },
  sw: { name: 'pmod_sw', label: 'Switches', group: 'Switches', dir: 'in', extra: {} },
  btn: { name: 'pmod_btn', label: 'Push buttons', group: 'Buttons', dir: 'in', extra: { activeHigh: true } },
  seg: { name: 'seg', label: '7-segment cathodes CA..CG', group: '7-segment', dir: 'out', extra: { activeLow: true } },
  dp: { name: 'dp', label: '7-segment decimal point', group: '7-segment', dir: 'out', extra: { activeLow: true } },
  an: { name: 'an', label: '7-segment anodes', group: '7-segment', dir: 'out', extra: { activeLow: true } },
  vga_red: { name: 'vga_red', label: 'VGA red', group: 'VGA', dir: 'out', extra: {} },
  vga_green: { name: 'vga_green', label: 'VGA green', group: 'VGA', dir: 'out', extra: {} },
  vga_blue: { name: 'vga_blue', label: 'VGA blue', group: 'VGA', dir: 'out', extra: {} },
  vga_hsync: { name: 'vga_hsync', label: 'VGA HSYNC', group: 'VGA', dir: 'out', extra: {} },
  vga_vsync: { name: 'vga_vsync', label: 'VGA VSYNC', group: 'VGA', dir: 'out', extra: {} },
};
const ALIASES = { leds: 'led', ld: 'led', switches: 'sw', switch: 'sw', sws: 'sw', buttons: 'btn', btns: 'btn', button: 'btn',
  segments: 'seg', sseg: 'seg', anodes: 'an', anode: 'an' };
const kindOfPort = (name) => { const k = String(name).toLowerCase(); return KINDS[k] ? k : ALIASES[k] || null; };
// a header's name as the board's silkscreen has it: a Pmod's (JA), the Arduino shield header's (SHIELD), else its own
const headerName = (r) => /^Pmod (\w+)/.exec(r.label || '')?.[1] || (/^Shield/i.test(r.label || '') ? 'SHIELD' : r.name.toUpperCase());

/**
 * The board `board` (a resolved board: { …, resources }) with the modules the design's ports make on its headers: a
 * resource for each kind of port on header pins (its pins those of the port's bits, in their order: the lowest bit's
 * first), extra.module true, extra.on the headers it is on (['JA', 'JC']; the Arty Z7's shield header SHIELD), extra.first the port's lowest bit on them
 * (LD4: a module of LD4..LD7). The same board when no port of a known kind is on a header. The LEDs, switches and
 * buttons are pmod_led, pmod_sw, pmod_btn (after the board's own: the LEDs numbered after them), the display's and the
 * VGA's the boards' own names (seg, dp, an, vga_red…).
 * @param ports        design.top.ports ({ name, dir, sig })
 * @param assignments  the constraints' assignments ({ 'led<4>': { loc: 'N15' }, … })
 */
export function withHeaderModules(board, ports, assignments = {}) {
  const res = board?.resources || [];
  // (made once: a board given with its modules is kept as it is)
  if (res.some((r) => r.extra?.module)) return board;
  const header = new Map();
  for (const r of res) if (r.group === 'Headers') r.pins.forEach((pin, idx) => header.set(String(pin).toUpperCase(), { res: r, idx }));
  if (!header.size) return board;
  const asg = new Map(Object.entries(assignments).map(([k, v]) => [k.toLowerCase(), v]));
  const found = new Map();   // kind -> [{ index, pin, on }]
  for (const port of ports || []) {
    const kind = kindOfPort(port.name);
    if (!kind || (KINDS[kind].dir === 'in') !== (port.dir === 'in')) continue;
    for (const b of portBits(port)) {
      const a = asg.get(b.name.toLowerCase()) || (port.sig.t.w === 1 ? asg.get((b.index == null ? `${port.name}<0>` : port.name).toLowerCase()) : null);
      const hit = a?.loc ? header.get(String(a.loc).toUpperCase()) : null;
      if (!hit) continue;
      if (!found.has(kind)) found.set(kind, []);
      found.get(kind).push({ index: b.index ?? 0, pin: a.loc, on: headerName(hit.res) });
    }
  }
  if (!found.size) return board;
  const modules = [...found].map(([kind, bits]) => {
    const k = KINDS[kind], sorted = bits.sort((x, y) => x.index - y.index), on = [...new Set(sorted.map((b) => b.on))];
    return { name: k.name, label: `${k.label} on ${on.join(', ')}`, pins: sorted.map((b) => b.pin),
      dir: k.dir, iostandard: 'LVCMOS33', group: k.group, extra: { ...k.extra, module: true, on, first: sorted[0].index } };
  });
  return { ...board, resources: [...res, ...modules] };
}

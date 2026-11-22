// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A register map's accesses on its bus (#5288; the map: core/regmap.js): an SPI link's or an I²C link's transfers
// (core/system-decode.js decodeSpi, decodeI2c) read as the map's protocol has them, each register read or written with
// its value, as Try it says them. Isomorphic ES module, no DOM.
//
//   regAccesses(map, { spi: transfers, ss })  or  regAccesses(map, { i2c: transfers })
//     -> { accesses: [{ t, op: 'read' | 'write', reg, value, partial }], warnings }

import { regsByAddr } from './regmap.js';

const hex = (v, bytes) => `0x${v.toString(16).padStart(2 * bytes, '0')}`;

// the SPI transfers in frames, one per SS low (decodeSpi reads none while SS is high): [{ t, bytes: [{ mosi, miso }] }]
function spiFrames(transfers, ss) {
  const rises = [];
  for (let k = 0; ss && k < ss.length; k += 2) if (ss[k + 1] === 1) rises.push(ss[k]);
  const frames = new Map();
  for (const x of transfers) {
    const id = rises.filter(r => r < x.t).length;
    if (!frames.has(id)) frames.set(id, { t: x.t, bytes: [] });
    frames.get(id).bytes.push(x);
  }
  return [...frames.values()];
}

/**
 * The map's accesses from its link's transfers: an SPI's ({ spi: decodeSpi's transfers, ss: SS's changes }), an I²C's
 * ({ i2c: decodeI2c's transfers }, those at the map's address). Each run of bytes at consecutive addresses gives the
 * registers it touched, each with its bytes' value (partial: not all its bytes); a byte at no register's address, a
 * warning.
 */
export function regAccesses(m, { spi = null, ss = null, i2c = null }) {
  const regs = regsByAddr(m), at = new Map();
  for (const r of regs) for (let k = 0; k < r.bytes; k++) at.set(r.addr + k, { r, k });
  const accesses = [], warnings = [];
  // a run of bytes from addr: each register's bytes put together
  const run = (t, op, addr, bytes) => {
    let cur = null;
    bytes.forEach((b, i) => {
      const a = (addr + i) & 0x7f, hit = at.get(a);
      if (!hit) { warnings.push(`${m.name}: a ${op} at the address ${hex(a, 1)}, no register's`); cur = null; return; }
      if (!cur || cur.reg !== hit.r.name) accesses.push(cur = { t, op, reg: hit.r.name, value: 0, seen: 0, bytes: hit.r.bytes });
      cur.value |= b << (8 * hit.k);
      cur.seen++;
    });
  };
  if (spi) {
    for (const f of spiFrames(spi, ss)) {
      const [cmd, ...data] = f.bytes;
      const read = !!(cmd.mosi & 0x80);
      if (data.length) run(f.t, read ? 'read' : 'write', cmd.mosi & 0x7f, data.map(d => (read ? d.miso : d.mosi)));
    }
  }
  if (i2c) {
    let ptr = 0;
    for (const x of i2c.filter(y => y.addr === m.address && y.ack)) {
      if (!x.read) {
        if (!x.data.length) continue;
        ptr = x.data[0].byte & 0x7f;
        const w = x.data.slice(1).map(d => d.byte);
        if (w.length) run(x.t, 'write', ptr, w);
        ptr += w.length;
      } else if (x.data.length) { run(x.t, 'read', ptr, x.data.map(d => d.byte)); ptr += x.data.length; }
    }
  }
  return { accesses: accesses.map(({ seen, bytes, ...a }) => ({ ...a, value: a.value >>> 0, partial: seen < bytes })), warnings };
}

/** An access as the console says it: write duty = 0x40, read count → 0x0123 (a part of its bytes: partial). */
export function accessText(m, a) {
  const r = m.registers.find(x => x.name === a.reg), bytes = r ? Math.max(1, Math.ceil(r.width / 8)) : 1;
  return `${a.op} ${a.reg} ${a.op === 'write' ? '=' : '→'} ${hex(a.value, bytes)}${a.partial ? ' (partial)' : ''}`;
}

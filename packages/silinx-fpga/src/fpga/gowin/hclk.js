// Silinx toolchain - gowin_pack's clock primitives (#4333), ported from Apicula's gowin_pack.py (YosysHQ/apicula, MIT, Copyright
// (c) 2019 Pepijn de Vos) for the GW1N: the HCLK's dividers CLKDIV and CLKDIV2 (set_hclk_attrs), DHCEN (the HCLK's stop,
// find_and_set_dhcen_hclk_fuses), the DCS (set_dcs_attrs) and the DQCE (the clock pip nextpnr names). The DLLDLY, which the
// GW1N-9C has not, is not ported.
import { ATTRIDS } from './attrids.js';
import { addAttrVal, setBits, shortvalFuses, tableFuses } from './chipdb.js';

const upper = o => { for (const [k, v] of Object.entries(o)) if (typeof v === 'string') o[k] = v.toUpperCase(); };
const codes = (db, table, a) => {
  const fin = new Set(), t = ATTRIDS[table.toLowerCase()];
  for (const [k, v] of Object.entries(a)) addAttrVal(db, table, fin, t.ids[k], typeof v === 'string' ? t.vals[v] : v);
  return fin;
};
const longFuses = (db, ttyp, attrs, name) => {
  const t = db.longfuses.get(ttyp)?.get(name);
  if (!t) throw new Error(`gowin_pack: no fuse table ${name} for the tile type ${ttyp}`);
  return tableFuses(attrs, t);
};
const DIV8 = new Set(['GW1N-1S', 'GW1N-2', 'GW1NR-2', 'GW1NS-4', 'GW1NS-4C', 'GW1NSR-4', 'GW1NSR-4C', 'GW1NSER-4C', 'GW1N-9', 'GW1NR-9', 'GW1N-9C',
  'GW1NR-9C', 'GW1N-1P5']);

/** set_hclk_attrs: a CLKDIV's or CLKDIV2's HCLK attribute codes; num its bel's (_HCLK<i>_SECT<j>). */
export function hclkAttrs(db, device, parms, num, typ, name) {
  upper(parms);
  const p = { GSREN: 'FALSE', DIV_MODE: '2', ...parms };
  const m = /^_HCLK([0,1])_SECT([0,1])$/.exec(num);
  if (!m) throw new Error(`gowin_pack: Unknown HCLK Bel/HCLK Section: ${typ}${num}`);
  const [, hclk, section] = m;
  const valid = ['2', '3.5', '4', '5', ...(DIV8.has(device) ? ['8'] : [])];
  if (!valid.includes(p.DIV_MODE)) {
    // (a binary value: bin_str_to_dec, and its first character kept, as gowin_pack does)
    const bits = /^[0,1]+/.exec(p.DIV_MODE), dec = bits ? String(parseInt(bits[0], 2)) : null;
    if (dec === null || !valid.includes(dec)) throw new Error(`gowin_pack: Invalid DIV_MODE ${dec || p.DIV_MODE} for CLKDIV ${name} on device ${device}`);
    p.DIV_MODE = dec[0];
  }
  const a = {};
  if (typ.startsWith('CLKDIV2')) a[`BK${section}MUX${hclk}_OUTSEL`] = 'DIV2';
  else if (typ.startsWith('CLKDIV')) {
    a[`HCLKDIV${hclk}_DIV`] = p.DIV_MODE;
    if (section === '1') a[`HCLKDCS${hclk}_SEL`] = `HCLKBK${section}${hclk}`;
  }
  return codes(db, 'HCLK', a);
}

const DHCEN_WIRES = {
  HCLK_IN0: ['HSB0MUX0_HSTOP', 'HCLKCIBSTOP0'], HCLK_IN1: ['HSB1MUX0_HSTOP', 'HCLKCIBSTOP2'], HCLK_IN2: ['HSB0MUX1_HSTOP', 'HCLKCIBSTOP1'],
  HCLK_IN3: ['HSB1MUX1_HSTOP', 'HCLKCIBSTOP3'], HCLK_BANK_OUT0: ['BRGMUX0_BRGSTOP', 'BRGCIBSTOP0'], HCLK_BANK_OUT1: ['BRGMUX1_BRGSTOP', 'BRGCIBSTOP1'],
};
/** find_and_set_dhcen_hclk_fuses: a DHCEN's stop on its HCLK wire, in every HCLK tile of its side. */
export function dhcenFuses(ctx, wire, side) {
  const { db } = ctx, [attr, val] = DHCEN_WIRES[wire];
  const a = new Set();
  addAttrVal(db, 'HCLK', a, ATTRIDS.hclk.ids[attr], ATTRIDS.hclk.vals[val]);
  const set = (row, col) => {
    const ttyp = db.grid[row][col];
    if (db.shortval.get(ttyp)?.has('HCLK')) setBits(ctx.tilemap.get(`${row},${col}`), shortvalFuses(db, ttyp, a, 'HCLK'));
  };
  if (side === 'T' || side === 'B') { const row = side === 'T' ? 0 : db.rows - 1; for (let col = 0; col < db.cols; col++) set(row, col); }
  else { const col = side === 'L' ? 0 : db.cols - 1; for (let row = 0; row < db.rows; row++) set(row, col); }
}

// the DCS's spine: its quadrant and its fuse table
const DCS_SPINES = { SPINE6: ['1', 'DCS6'], SPINE7: ['1', 'DCS7'], SPINE14: ['2', 'DCS6'], SPINE15: ['2', 'DCS7'], SPINE22: ['3', 'DCS6'],
  SPINE23: ['3', 'DCS7'], SPINE30: ['4', 'DCS6'], SPINE31: ['4', 'DCS7'] };
/** A DCS's fuses (set_dcs_attrs): its mode in the long fuses of its spine's table. */
export function dcsFuses(ctx, row, col, num, attrs) {
  const { db } = ctx;
  if (!('DCS_MODE' in attrs)) return;
  const spine = db.extra_func.get(`${row},${col}`).get('dcs').get(Number(num)).get('clkout');
  const [q, idx] = DCS_SPINES[spine];
  upper(attrs);
  setBits(ctx.tilemap.get(`${row},${col}`), longFuses(db, db.grid[row][col], codes(db, 'DCS', { [q]: attrs.DCS_MODE }), idx));
}

/** A DQCE's fuses: the clock pip nextpnr names (DQCE_PIP, X<col>Y<row>/<dest>/<src>). */
export function dqceFuses(ctx, name, attrs) {
  const { db } = ctx;
  if (!('DQCE_PIP' in attrs)) return;
  const m = /^X(\d+)Y(\d+)\/(\w+)\/(\w+)$/.exec(attrs.DQCE_PIP);
  if (!m) throw new Error(`gowin_pack: Bad DQCE pip ${attrs.DQCE_PIP} at ${name}`);
  const [, c, r, dest, src] = m;
  setBits(ctx.tilemap.get(`${r},${c}`), db.tileAt(Number(r), Number(c)).get('clock_pips').get(dest).get(src));
}

// Silinx toolchain - gowin_pack's I/O logic (#4333), ported from Apicula's gowin_pack.py (YosysHQ/apicula, MIT, Copyright (c)
// 2019 Pepijn de Vos) for the GW1N: ODDR / ODDRC, IDDR / IDDRC, OSER4 / 8 / 10 / 16, IDES4 / 8 / 10 / 16, OVIDEO / IVIDEO and
// nextpnr's IOLOGIC cells (their dummies, the empty halves): the cell's type and fast clock (place's IOLOGIC branch), its
// attributes (set_iologic_attrs, iologic_mod_attrs, set_iologic_fclk, make_iodelay_attrs), its fuses in the IOLOGIC table of
// its I/O's tile (or the tile its fuses are in).
import { ATTRIDS } from './attrids.js';
import { addAttrVal, setBits, shortvalFuses } from './chipdb.js';

export const IOLOGIC_TYPES = new Set(['IOLOGIC', 'IOLOGICI', 'IOLOGICO', 'IOLOGIC_DUMMY', 'ODDR', 'ODDRC', 'OSER4', 'OSER8', 'OSER10', 'OVIDEO',
  'IDDR', 'IDDRC', 'IDES4', 'IDES8', 'IDES10', 'IVIDEO', 'IOLOGICI_EMPTY', 'IOLOGICO_EMPTY']);
const DDR_TYPES = new Set(['IDDR', 'IDDRC', 'ODDR', 'ODDRC', 'IOLOGICI_EMPTY', 'IOLOGICO_EMPTY']);
// the HCLK wires and the clock spines share their numbers in the fuse tables (the spines never run along the edges)
const RECODE_SPINES = { UNKNOWN: 'UNKNOWN', HCLK_OUT0: 'SPINE10', HCLK_OUT1: 'SPINE11', HCLK_OUT2: 'SPINE12', HCLK_OUT3: 'SPINE13' };
const SER = { GSREN: 'FALSE', LSREN: 'TRUE' };
const DEFAULTS = {
  DUMMY: {}, IOLOGIC: {}, IOLOGIC_DUMMY: {}, IOLOGICI_EMPTY: SER, IOLOGICO_EMPTY: SER, ODDR: { TXCLK_POL: '0' }, ODDRC: { TXCLK_POL: '0' },
  OSER4: { ...SER, TXCLK_POL: '0', HWL: 'FALSE' }, OSER8: { ...SER, TXCLK_POL: '0', HWL: 'FALSE' }, OSER10: SER, OSER16: { ...SER, CLKOMUX: 'ENABLE' },
  OVIDEO: SER, IDES4: SER, IDES8: SER, IDES10: SER, IVIDEO: SER, IDDR: { CLKIMUX: 'ENABLE', LSRIMUX_0: '0', LSROMUX_0: '0' },
  IDDRC: { CLKIMUX: 'ENABLE', LSRIMUX_0: '1', LSROMUX_0: '0' }, IDES16: { ...SER, CLKIMUX: 'ENABLE' },
};
const upper = o => { for (const [k, v] of Object.entries(o)) if (typeof v === 'string') o[k] = v.toUpperCase(); };

// iologic_mod_attrs: the primitive's parameters to the table's attributes
function modAttrs(a) {
  upper(a);
  if ('TXCLK_POL' in a) { a.TSHX = parseInt(a.TXCLK_POL, 10) === 0 ? 'SIG' : 'INV'; delete a.TXCLK_POL; }
  if ('HWL' in a) { if (a.HWL === 'TRUE') a.UPDATE = 'SAME'; delete a.HWL; }
  if ('GSREN' in a) { if (a.GSREN === 'TRUE') a.GSR = 'ENGSR'; delete a.GSREN; }
  if (a.OUTMODE === 'VIDEOTX') a.OUTMODE = 'VIDEORX';
  delete a.LSREN; delete a.Q0_INIT; delete a.Q1_INIT;
}

// make_iodelay_attrs: the I/O's delay (an IODELAY packed with it)
function iodelay(a, param) {
  if (!('IODELAY' in param)) return;
  if (param.IODELAY === 'IN') a.INDEL = 'ENABLE'; else a.OUTDEL = 'ENABLE';
  Object.assign(a, { CLKOMUX: 'ENABLE', IMARG: 'ENABLE', INDEL_0: 'ENABLE', INDEL_1: 'ENABLE' });
  if (!('C_STATIC_DLY' in a)) return;
  for (let i = 1; i < 8; i++) if (a.C_STATIC_DLY.at(-i) === '1') a[`DELAY_DEL${i - 1}`] = '1';
  delete a.C_STATIC_DLY;
}

// set_iologic_fclk: the fast clock's edge clock (the HCLK it comes from)
function fclk(a, parms, param, out) {
  const f = param.IOLOGIC_FCLK, eclk = f === 'SPINE12' || f === 'SPINE13' ? 'ECLK1' : f === 'SPINE10' || f === 'SPINE11' ? 'ECLK0' : null;
  if (out) {
    if (parms.OUTMODE !== 'ODDRX1') a.CLKODDRMUX_WRCLK = 'ECLK0';
    a.CLKODDRMUX_ECLK = eclk ?? 'UNKNOWN';
  } else if (eclk) a.CLKIDDRMUX_ECLK = eclk;
}

/** set_iologic_attrs: an I/O logic cell's attribute codes; parms its parameters, param its attributes (IOLOGIC_TYPE, IOLOGIC_FCLK). */
export function iologicAttrs(db, parms, param) {
  upper(parms);
  const type = param.IOLOGIC_TYPE, a = { ...DEFAULTS[type], ...parms };
  modAttrs(a);
  if ('OUTMODE' in parms) {
    if (type === 'IOLOGICO_EMPTY') delete a.OUTMODE;
    else {
      a.LSROMUX_0 = parms.OUTMODE !== 'ODDRX1' || type === 'ODDRC' ? '1' : '0';
      if (parms.OUTMODE === 'ODDRX8' || parms.OUTMODE === 'DDRENABLE16') a.LSROMUX_0 = '0';
      if (parms.OUTMODE === 'DDRENABLE16') { a.OUTMODE = 'DDRENABLE'; a.ISI = 'ENABLE'; }
      if (parms.OUTMODE === 'DDRENABLE') a.ISI = 'ENABLE';
      a.LSRIMUX_0 = '0';
      a.CLKOMUX = 'ENABLE';
      fclk(a, parms, param, true);
    }
  }
  if ('INMODE' in parms) {
    if (type === 'IOLOGICI_EMPTY') delete a.INMODE;
    else {
      if (type !== 'IDDR' && type !== 'IDDRC') {
        a.CLKIMUX_1 = '1';
        a.LSRIMUX_0 = parms.INMODE === 'IDDRX8' || parms.INMODE === 'DDRENABLE16' ? '0' : '1';
        if (parms.INMODE === 'DDRENABLE16') { a.INMODE = 'DDRENABLE'; a.ISI = 'ENABLE'; }
        if (parms.INMODE === 'DDRENABLE') a.ISI = 'ENABLE';
        a.LSROMUX_0 = '0';
        a.CLKIMUX = 'ENABLE';
      }
      fclk(a, parms, param, false);
    }
  }
  iodelay(a, param);
  const fin = new Set();
  for (const [k, v] of Object.entries(a)) {
    if (!(k in ATTRIDS.iologic.ids)) continue;   // (gowin_pack prints "XXX IOLOGIC: add … key handle")
    if (!(v in ATTRIDS.iologic.vals)) throw new Error(`gowin_pack: no code for the I/O logic's ${k}=${v}`);
    addAttrVal(db, 'IOLOGIC', fin, ATTRIDS.iologic.ids[k], ATTRIDS.iologic.vals[v]);
  }
  return fin;
}

/** place's IOLOGIC branch: the cell's type and fast clock recorded in its attributes, then its fuses. cells: the netlist's (a
 *  dummy's fast clock is its main cell's). */
export function placeIologic(ctx, cells, b) {
  const { db } = ctx, { typ, row, col, parms, attrs } = b;
  let num = b.num;
  if (num.endsWith('I') || num.endsWith('O')) num = num.slice(0, -1);
  if (typ === 'IOLOGIC_DUMMY') attrs.IOLOGIC_FCLK = cells[attrs.MAIN_CELL].attributes.IOLOGIC_FCLK;
  attrs.IOLOGIC_TYPE = typ;
  if (!DDR_TYPES.has(typ)) { if (attrs.IOLOGIC_FCLK in RECODE_SPINES) attrs.IOLOGIC_FCLK = RECODE_SPINES[attrs.IOLOGIC_FCLK]; }
  else attrs.IOLOGIC_FCLK = 'UNKNOWN';
  const a = iologicAttrs(db, parms, attrs);
  let r = row - 1, c = col - 1;
  const off = db.tileAt(r, c).get('bels').get(`IOB${num}`).get('fuse_cell_offset');
  if (off) { r += off[0]; c += off[1]; }
  setBits(ctx.tilemap.get(`${r},${c}`), shortvalFuses(db, db.grid[r][c], a, `IOLOGIC${num}`));
}

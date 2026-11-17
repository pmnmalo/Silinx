// Silinx toolchain - the Gowin's DSPs in gowin_pack (#2303, #4333), ported from Apicula's gowin_pack.py (YosysHQ/apicula, MIT,
// Copyright (c) 2019 Pepijn de Vos): set_dsp_attrs and its 9x9 parts (set_mult9x9_attrs: MULT9X9, MULT18X18; set_padd9_attrs:
// PADD9, PADD18), set_dsp_mult36x36_attrs (two macros), and place's DSP branch; the ALUs' are in dsp-multalu.js. The GW5A's
// (MULT12X12, MULTALU27X18, MULTADDALU12X12) are refused.
import { ATTRIDS } from './attrids.js';
import { addAttrVal, setBits, shortvalFuses } from './chipdb.js';
import { attrsUpper, regs0, ctlVals, ctl, multalu18x18, multaddalu18x18, multalu36x18, alu54d } from './dsp-multalu.js';

const GW5A_DSPS = new Set(['MULT12X12', 'MULTALU27X18', 'MULTADDALU12X12']);

// set_mult9x9_attrs: one 9x9 multiplier of a DSP macro (a MULT18X18 is two)
function mult9x9(params, attrs, a, pairIdx, idx, evenOdd) {
  attrsUpper(attrs);
  const c = ctlVals(attrs);
  const sync = params.MULT_RESET_MODE === 'SYNC';
  const p = pairIdx, HL = evenOdd ? 'H' : 'L';
  a[`IRASHFEN_${p}`] = '1'; a[`IRBSHFEN_${p}`] = '1';
  if (p) a.MATCH_SHFEN = 'ENABLE';
  a[`OR2CIB_EN${p}${HL}_${idx}`] = 'ENABLE';
  if (attrs.NET_ASEL === 'VCC') a[`AIRMUX1_${p}`] = 'ENABLE';
  else if (attrs.NET_ASEL && attrs.NET_ASEL !== 'GND') a[`AIRMUX1_SEL_${p}`] = 'ENABLE';
  if (attrs.NET_BSEL === 'VCC') a[`BIRMUX1_${p * 2}`] = 'ENABLE';
  else if (attrs.NET_BSEL && attrs.NET_BSEL !== 'GND') for (const k of [`BIRMUX0_${p * 2}`, `BIRMUX0_${p * 2 + 1}`, `BIRMUX1_${p * 2}`, `BIRMUX1_${p * 2 + 1}`]) a[k] = 'ENABLE';
  regs0(params, ['AREG', 'BREG', 'OUT_REG', 'PIPE_REG', 'ASIGN_REG', 'BSIGN_REG', 'SOA_REG']);
  const regs = (name, gen) => { ctl(a, `${HL}MUX_${name}`, c); if (sync && gen) a[`RSTGEN${HL}MUX_${name}`] = 'SYNC'; };
  for (const [parm, val] of Object.entries(params)) {
    if (parm === 'AREG' || parm === 'BREG') {
      const ab = parm[0], n = p * 4 + (ab === 'A' ? 0 : 2) + (evenOdd ? 1 : 0);
      if (val === '0') { a[`IRBY_IREG${p}${ab}${HL}_${n}`] = 'ENABLE'; a[`IRNS_IREG${p}${ab}${HL}_${n}`] = 'ENABLE'; }
      else regs(`REGM${ab}${p}`, true);
    }
    if (parm === 'ASIGN_REG' || parm === 'BSIGN_REG') {
      const k = parm === 'ASIGN_REG' ? 0 : 1, s = parm.slice(0, 5);
      if (val === '0') { a[`CINNS_${p * 3 + k}`] = 'ENABLE'; a[`CINBY_${p * 3 + k}`] = 'ENABLE'; }
      else { ctl(a, `MUX_${s}${p}1`, c); if (sync) a[`RSTGENMUX_${s}${p}1`] = 'SYNC'; }
    }
    if (parm === 'PIPE_REG') {
      if (val === '0') {
        for (const k of [`CPRNS_${p * 3}`, `CPRBY_${p * 3}`, `CPRNS_${p * 3 + 1}`, `CPRBY_${p * 3 + 1}`]) a[k] = 'ENABLE';
        a[`PPREG${p}_NS${HL}_${idx}`] = 'ENABLE'; a[`PPREG${p}_BYP${HL}_${idx}`] = 'ENABLE';
      } else {
        for (const s of ['ASIGN', 'BSIGN']) ctl(a, `MUX_${s}${p}2`, c);
        regs(`REGP${p}`, false);
        if (sync) { a[`RSTGENMUX_ASIGN${p}2`] = 'SYNC'; a[`RSTGENMUX_BSIGN${p}2`] = 'SYNC'; a[`RSTGEN${HL}MUX_REGP${p}`] = 'SYNC'; }
      }
    }
    if (parm === 'OUT_REG') {
      if (val === '0') { a[`OREG${p}_BYP${HL}_${idx}`] = 'ENABLE'; a[`OREG${p}_NS${HL}_${idx}`] = 'ENABLE'; }
      else regs(`OREG${p}`, true);
    }
    if (parm === 'SOA_REG' && p) {
      if (val === '0') {
        if (evenOdd) { a.IRBY_IRMATCHH_9 = 'ENABLE'; a.IRNS_IRMATCHH_9 = 'ENABLE'; } else { a.IRBY_IRMATCHL_8 = 'ENABLE'; a.IRNS_IRMATCHL_8 = 'ENABLE'; }
      } else regs('REGSD', true);
    }
  }
}

// set_padd9_attrs: one 9-bit pre-adder of a DSP macro (a PADD18 is two), its result multiplied by 1
function padd9(params, attrs, a, pairIdx, idx, evenOdd) {
  attrsUpper(attrs);
  const p = pairIdx, HL = evenOdd ? 'H' : 'L';
  a[`CINBY_${p + 7}`] = 'ENABLE'; a[`CINNS_${p + 7}`] = 'ENABLE';
  if (p) { a.CIR_BYPH_1 = '1'; a.RCISEL_3 = '1'; } else { a.CIR_BYPL_0 = '1'; a.RCISEL_1 = '1'; }
  if (p === 0 && 'LAST_IN_CHAIN' in attrs) a.PRAD_FBB1 = 'ENABLE';
  a[`PRAD_MUXA0EN_${p}`] = 'ENABLE';
  if (attrs.NET_ASEL === 'VCC') a[`PRAD_MUXA1_${p * 2}`] = 'ENABLE';
  else if (attrs.NET_ASEL && attrs.NET_ASEL !== 'GND') { a[`PRAD_MUXA1_${p * 2}`] = 'ENABLE'; a[`PRAD_MUXA1_${p * 2 + 1}`] = 'ENABLE'; }
  const c = ctlVals(attrs), sync = params.PADD_RESET_MODE === 'SYNC';
  if (p) { a.MATCH = 'ENABLE'; a.MATCH_SHFEN = 'ENABLE'; }
  a[`OR2CIB_EN${p}L_${p * 2}`] = 'ENABLE';
  regs0(params, ['AREG', 'BREG']);
  for (const [parm, val] of Object.entries(params)) {
    if (parm === 'AREG' || parm === 'BREG') {
      const ab = parm[0], n = p * 4 + (ab === 'A' ? 0 : 2) + (evenOdd ? 1 : 0);
      if (val === '0') { a[`IRNS_PRAD${p}${ab}${HL}_${n}`] = 'ENABLE'; a[`IRBY_PRAD${p}${ab}${HL}_${n}`] = 'ENABLE'; }
      else if (evenOdd) {
        ctl(a, `HMUX_REG${ab}${p}`, c);
        if (sync) a[`RSTGENHMUX_REG${ab}${p}`] = 'SYNC';
      } else {
        // (the low half's B register through REGMA's: gowin_pack's)
        ctl(a, `LMUX_REGMA${p}`, c);
        if (sync) a[`RSTGENLMUX_REG${ab}${p}`] = 'SYNC';
      }
    }
    if (parm === 'SOREG' && p) {
      if (val === '0') {
        if (evenOdd) { a.IRNS_IRMATCHH_9 = 'ENABLE'; a.IRBY_IRMATCHH_9 = 'ENABLE'; } else { a.IRNS_IRMATCHL_8 = 'ENABLE'; a.IRBY_IRMATCHL_8 = 'ENABLE'; }
      } else {
        ctl(a, `${HL}MUX_REGSD`, c);
        if (sync) a[`RSTGEN${HL}MUX_REGSD`] = 'SYNC';
      }
    }
    if (parm === 'BSEL_MODE') a[`PRAD_MUXB_${p * 2 + (val === '0' ? 0 : 1)}`] = 'ENABLE';
  }
  // the multiplier: * C=1
  a[`AIRMUX0_${p}`] = 'ENABLE'; a[`BIRMUX0_${p * 2}`] = 'ENABLE';
  const h = evenOdd ? 1 : 0;
  for (const k of [`IRBY_IREG${p}A${HL}_${p * 4 + h}`, `IRNS_IREG${p}A${HL}_${p * 4 + h}`, `IRBY_IREG${p}B${HL}_${p * 4 + 2 + h}`,
    `IRNS_IREG${p}B${HL}_${p * 4 + 2 + h}`, `CINNS_${p * 3}`, `CINBY_${p * 3}`, `CPRNS_${p * 3}`, `CPRBY_${p * 3}`, `CINNS_${p * 3 + 1}`,
    `CINBY_${p * 3 + 1}`, `CPRNS_${p * 3 + 1}`, `CPRBY_${p * 3 + 1}`, `PPREG${p}_NS${HL}_${p * 2 + h}`, `PPREG${p}_BYP${HL}_${p * 2 + h}`,
    `OREG${p}_NS${HL}_${p * 2 + h}`, `OREG${p}_BYP${HL}_${p * 2 + h}`, `OR2CIB_EN${p}${HL}_${p * 2 + h}`]) a[k] = 'ENABLE';
}

// a macro's attributes (by name) to the DSP table's codes
function codes(db, a) {
  const fin = new Set();
  for (const [attr, v] of Object.entries(a)) addAttrVal(db, 'DSP', fin, ATTRIDS.dsp.ids[attr], typeof v === 'string' ? ATTRIDS.dsp.vals[v] : v);
  return fin;
}

/** set_dsp_attrs: a DSP primitive's attribute codes; num its bel's (mac, then the index in it). */
export function dspAttrs(ctx, typ, params, num, attrs) {
  if (GW5A_DSPS.has(typ)) throw new Error(`gowin_pack: the DSP primitive ${typ} is the GW5A's, not supported`);
  const a = {};
  let idx = Number(num[1]);
  const half = (f, i) => f(params, attrs, a, i >> 1, i, i & 1);
  if (typ === 'PADD9' || typ === 'MULT9X9') a.M9MODE_EN = 'ENABLE';
  if (typ === 'PADD9') half(padd9, idx);
  else if (typ === 'PADD18') { idx *= 2; half(padd9, idx); half(padd9, idx + 1); }
  else if (typ === 'MULT9X9') half(mult9x9, idx);
  else if (typ === 'MULT18X18') { idx *= 2; half(mult9x9, idx); half(mult9x9, idx + 1); }
  else if (typ === 'ALU54D') alu54d(params, attrs, a);
  else if (typ === 'MULTALU18X18') multalu18x18(params, attrs, a);
  else if (typ === 'MULTALU36X18') multalu36x18(typ, params, attrs, a, Number(num[0]));
  else if (typ === 'MULTADDALU18X18') multaddalu18x18(params, attrs, a);
  return codes(ctx.db, a);
}

/** set_dsp_mult36x36_attrs: the MULT36X36's two macros' attribute codes, [mac 0, mac 1]: A*B's low part, then its high part
 *  plus the first's cascade. */
export function mult36x36Attrs(ctx, typ, params, attrs) {
  attrsUpper(attrs);
  attrs.NET_ASEL = 'GND'; attrs.NET_BSEL = 'GND';
  regs0(params, ['AREG', 'BREG', 'ASIGN_REG', 'BSIGN_REG']);
  const match = a => { for (const k of ['IRNS_IRMATCHH_9', 'IRNS_IRMATCHL_8', 'IRBY_IRMATCHH_9', 'IRBY_IRMATCHL_8', 'MATCH_SHFEN']) a[k] = 'ENABLE'; };
  const drop = (a, ...ks) => { for (const k of ks) delete a[k]; };
  // macro 0: ACC/0 + A*B
  const a0 = {};
  params.MULTALU36X18_MODE = '1';
  attrs.NET_ACCLOAD = 'GND';
  params.OUT_REG = params.OUT0_REG ?? '0';
  params.ACCLOAD_REG0 = '0'; params.ACCLOAD_REG1 = '0';
  multalu36x18(typ, params, attrs, a0, 0);
  a0.OR2CASCADE_EN = 'ENABLE';
  match(a0);
  drop(a0, 'IRASHFEN_0', 'RCISEL_1', 'RCISEL_3');
  // macro 1: A*B + CASI
  const a1 = {};
  params.MULTALU36X18_MODE = '10';
  params.OUT_REG = params.OUT1_REG ?? '0';
  multalu36x18(typ, params, attrs, a1, 1);
  a1.CSGIN_EXT = 'ENABLE'; a1.CSIGN_PRE = 'ENABLE';
  match(a1);
  drop(a1, 'IRASHFEN_0', 'RCISEL_1', 'RCISEL_3', 'OPCD_5');
  a1.OPCD_4 = '1';
  return [codes(ctx.db, a0), codes(ctx.db, a1)];
}

/** place's DSP branch: a DSP primitive's fuses in its cell (t its tile's data, tile its bitmap), typ the cell's type (an aux
 *  cell's too), num its bel's suffix. */
export function placeDsp(ctx, t, tile, typ, parms, num, attrs) {
  const { db } = ctx, ttyp = t.get('ttyp'), tables = db.shortval.get(ttyp);
  if (GW5A_DSPS.has(typ)) throw new Error(`gowin_pack: the DSP primitive ${typ} is the GW5A's, not supported`);
  // (the ALUs' bels are named by their macro alone: its number twice)
  if (['MULTADDALU18X18', 'MULTALU36X18', 'MULTALU18X18', 'ALU54D'].includes(typ)) num = num.at(-1) + num.at(-1);
  if (typ === 'MULT36X36') {
    const a = mult36x36Attrs(ctx, typ, parms, attrs);
    for (let mac = 0; mac < 2; mac++) if (tables?.has(`DSP${mac}`)) setBits(tile, shortvalFuses(db, ttyp, a[mac], `DSP${mac}`));
    return;
  }
  const a = dspAttrs(ctx, typ, parms, num, attrs);
  if (tables?.has(`DSP${num.at(-2)}`)) setBits(tile, shortvalFuses(db, ttyp, a, `DSP${num.at(-2)}`));
}

// Silinx toolchain - the Gowin's DSPs with an ALU in gowin_pack (#4333), ported from Apicula's gowin_pack.py (YosysHQ/apicula,
// MIT, Copyright (c) 2019 Pepijn de Vos): set_multalu18x18_attrs, set_multaddalu18x18_attrs, set_multalu36x18_attrs (MULT36X36's
// two macros too, dsp.js) and set_alu54d_attrs, each filling a DSP macro's attributes (a, by name) from the cell's parameters
// (params, completed with its registers off) and attributes (attrs: its control nets' indexes, its constant nets).
const bin = v => parseInt(v, 2);
const LH01 = [[0, 'L'], [1, 'H']];
const ABLH = [['A', 'L'], ['A', 'H'], ['B', 'L'], ['B', 'H']];
/** attrs_upper: a cell's string values upper case, in place. */
export const attrsUpper = o => { for (const [k, v] of Object.entries(o)) if (typeof v === 'string') o[k] = v.toUpperCase(); };
/** set_dsp_regs_0: the registers not given, off. */
export const regs0 = (params, names) => { for (const n of names) if (!(n in params)) params[n] = '0'; };
/** The control nets' values: [CE, CLK, RESET] (CEIN1…, UNKNOWN when none). */
export function ctlVals(attrs) {
  const pick = (k, pre) => (bin(attrs[k]) ? `${pre}${bin(attrs[k])}` : 'UNKNOWN');
  return [pick('CE', 'CEIN'), pick('CLK', 'CLKIN'), pick('RESET', 'RSTIN')];
}
/** A register's clock enable, clock and reset: CE<s>, CLK<s>, RST<s>. */
export const ctl = (a, s, [ce, clk, rst]) => { a[`CE${s}`] = ce; a[`CLK${s}`] = clk; a[`RST${s}`] = rst; };
const sync = params => params.MULT_RESET_MODE === 'SYNC';
const enable = (a, ...names) => { for (const n of names) a[n] = 'ENABLE'; };

// the ALU's common part of the MULTALU18X18, MULTADDALU18X18 and MULTALU36X18: the outputs to the fabric, the cascade
function orCib(a) {
  enable(a, 'OR2CIB_EN0L_0', 'OR2CIB_EN0H_1', 'OR2CIB_EN1L_2', 'OR2CIB_EN1H_3');
}
const unusedIns = a => { for (const i of [5, 6]) enable(a, `CINBY_${i}`, `CINNS_${i}`, `CPRBY_${i}`, `CPRNS_${i}`); };
function cascade(a, attrs) {
  if ('USE_CASCADE_IN' in attrs) enable(a, 'CSGIN_EXT', 'CSIGN_PRE');
  if ('USE_CASCADE_OUT' in attrs) a.OR2CASCADE_EN = 'ENABLE';
}

// the registers the three share: a multiplier k's A or B input, the sign registers, its pipeline, the output, the accumulator's load
function inReg(a, params, ab, k, val, c) {
  const off = ab === 'A' ? 0 : 2;
  if (val === '0') for (const [i, h] of LH01) enable(a, `IRBY_IREG${k}${ab}${h}_${4 * k + off + i}`, `IRNS_IREG${k}${ab}${h}_${4 * k + off + i}`);
  else {
    for (const h of 'LH') ctl(a, `${h}MUX_REGM${ab}${k}`, c);
    if (sync(params)) for (const h of 'LH') a[`RSTGEN${h}MUX_REGM${ab}${k}`] = 'SYNC';
  }
}
function cReg(a, params, val, c) {
  if (val === '0') for (const [i, h] of LH01) a[`CIR_BYP${h}_${i}`] = '1';
  else {
    for (const h of 'LH') ctl(a, `${h}MUX_CREG`, c);
    if (sync(params)) for (const h of 'LH') a[`RSTGEN${h}MUX_REGC0`] = 'SYNC';
  }
}
function signReg(a, params, s, k, val, c) {
  const n = (s === 'A' ? 0 : 1) + 3 * k;
  if (val === '0') enable(a, `CINNS_${n}`, `CINBY_${n}`);
  else {
    ctl(a, `MUX_${s}SIGN${k}1`, c);
    if (sync(params)) a[`RSTGENMUX_${s}SIGN${k}1`] = 'SYNC';
  }
}
function pipeReg(a, params, k, val, c, regK = k) {
  if (val === '0') {
    enable(a, `CPRNS_${3 * k}`, `CPRBY_${3 * k}`, `CPRNS_${1 + 3 * k}`, `CPRBY_${1 + 3 * k}`);
    for (const [i, h] of LH01) enable(a, `PPREG${k}_NS${h}_${2 * k + i}`, `PPREG${k}_BYP${h}_${2 * k + i}`);
  } else {
    for (const i of 'AB') ctl(a, `MUX_${i}SIGN${regK}2`, c);
    for (const i of 'LH') ctl(a, `${i}MUX_REGP${regK}`, c);
    if (sync(params)) {
      a[`RSTGENMUX_ASIGN${regK}2`] = 'SYNC'; a[`RSTGENMUX_BSIGN${regK}2`] = 'SYNC';
      a[`RSTGENLMUX_REGP${regK}`] = 'SYNC'; a[`RSTGENHMUX_REGP${regK}`] = 'SYNC';
    }
  }
}
function outReg(a, params, val, c) {
  if (val === '0') {
    for (let k = 0; k < 2; k++) enable(a, `OREG${k}_NSL_${2 * k}`, `OREG${k}_BYPL_${2 * k}`, `OREG${k}_NSH_${2 * k + 1}`, `OREG${k}_BYPH_${2 * k + 1}`);
  } else {
    for (let k = 0; k < 2; k++) for (const h of 'LH') ctl(a, `${h}MUX_OREG${k}`, c);
    if (sync(params)) for (const h of 'LH') { a[`RSTGEN${h}MUX_OREG0`] = 'SYNC'; a[`RSTGEN${h}MUX_OREG1`] = 'SYNC'; }
  }
}
function accloadReg(a, params, n, val, c) {
  if (val === '0') { if (n === 1) enable(a, 'CINNS_2', 'CINBY_2'); else enable(a, 'CPRNS_2', 'CPRBY_2'); }
  else {
    ctl(a, `MUX_ALUSEL${n}`, c);
    if (sync(params)) a[`RSTGENMUX_ALUSEL${n}`] = 'SYNC';
  }
}

/** set_multalu18x18_attrs: one multiplier (its mode's: 2 the second, else the first) and the ALU. */
export function multalu18x18(params, attrs, a) {
  attrsUpper(attrs);
  const c = ctlVals(attrs);
  // (the mode, from {0, 1, 2}, picks the multiplier and so the registers and pins)
  const mode = bin(params.MULTALU18X18_MODE), m = mode !== 2 ? 1 : 0;
  const accload = attrs.NET_ACCLOAD;
  a.RCISEL_3 = '1';
  if (m) a.RCISEL_1 = '1';
  orCib(a);
  if ('B_ADD_SUB' in params && bin(params.B_ADD_SUB) === 1) a.OPCD_7 = '1';
  a.ALU_EN = 'ENABLE'; a.OPCD_5 = '1'; a.OPCD_9 = '1';
  unusedIns(a);
  cascade(a, attrs);
  if (m) {
    a.OPCD_2 = '1';
    if (accload === 'VCC') a.OR2CASCADE_EN = 'ENABLE';
    else if (accload === 'GND') { a.OPCD_0 = '1'; a.OPCD_1 = '1'; }
    else enable(a, 'OPCDDYN_0', 'OPCDDYN_1', 'OR2CASCADE_EN', 'OPCDDYN_INV_0', 'OPCDDYN_INV_1');
    if (mode === 0) {
      a.OPCD_4 = '1';
      if ('C_ADD_SUB' in params && bin(params.C_ADD_SUB) === 1) a.OPCD_8 = '1';
    }
  } else { a.OPCD_0 = '1'; a.OPCD_3 = '1'; }
  regs0(params, ['AREG', 'BREG', 'CREG', 'DREG', 'DSIGN_REG', 'ASIGN_REG', 'BSIGN_REG', 'PIPE_REG', 'OUT_REG']);
  for (const [parm, val] of Object.entries(params)) {
    if (parm === 'AREG') inReg(a, params, 'A', m, val, c);
    if (parm === 'BREG') inReg(a, params, 'B', m, val, c);
    if (parm === 'CREG' && m) cReg(a, params, val, c);
    if (parm === 'DREG' && !m) {
      if (val === '0') {
        a.CIR_BYPH_1 = '1';
        let ii = 4;
        for (const [i, h] of ABLH) { enable(a, `IRBY_IREG1${i}${h}_${ii}`, `IRNS_IREG1${i}${h}_${ii}`); ii++; }
      } else {
        ctl(a, 'HMUX_CREG', c);
        for (const [i, h] of ABLH) ctl(a, `${h}MUX_REGM${i}1`, c);
        if (sync(params)) {
          a.RSTGENHMUX_REGC0 = 'SYNC';
          for (const [i, h] of ABLH) a[`RSTGEN${h}MUX_REGM${i}1`] = 'SYNC';
        }
      }
    }
    if (parm === 'ASIGN_REG') signReg(a, params, 'A', m, val, c);
    if (parm === 'BSIGN_REG') signReg(a, params, 'B', m, val, c);
    if (parm === 'DSIGN_REG' && !m) {
      if (val === '0') enable(a, 'CINNS_4', 'CINBY_4');
      else {
        ctl(a, 'MUX_BSIGN11', c);
        if (sync(params)) a.RSTGENMUX_BSIGN11 = 'SYNC';
      }
      if ('PIPE_REG' in params) {
        if (params.PIPE_REG === '0') enable(a, 'CPRNS_4', 'CPRBY_4');
        else {
          a.CLK_BSIGN12 = c[1]; a.RST_BSIGN12 = c[2];
          if (sync(params)) a.RSTGENMUX_BSIGN12 = 'SYNC';
        }
      }
    }
    // (the pipeline's registers of the other multiplier, 1 - m, when on: gowin_pack's)
    if (parm === 'PIPE_REG') pipeReg(a, params, m, val, c, 1 - m);
    if (parm === 'OUT_REG') outReg(a, params, val, c);
    if (parm === 'ACCLOAD_REG0') accloadReg(a, params, 1, val, c);
    if (parm === 'ACCLOAD_REG1') accloadReg(a, params, 2, val, c);
  }
}

/** set_multaddalu18x18_attrs: both multipliers, their sum and the ALU. */
export function multaddalu18x18(params, attrs, a) {
  attrsUpper(attrs);
  const c = ctlVals(attrs);
  const mode = bin(params.MULTADDALU18X18_MODE), accload = attrs.NET_ACCLOAD;
  if (mode === 0) { a.RCISEL_3 = '1'; a.RCISEL_1 = '1'; }
  orCib(a);
  if ('B_ADD_SUB' in params && bin(params.B_ADD_SUB) === 1) a.OPCD_7 = '1';
  cascade(a, attrs);
  a.ALU_EN = 'ENABLE'; a.OPCD_0 = '1'; a.OPCD_2 = '1'; a.OPCD_9 = '1';
  unusedIns(a);
  aluMode(a, params, mode, accload);
  if (attrs.NET_ASEL0 === 'VCC') a.AIRMUX1_0 = 'ENABLE';
  else if (attrs.NET_ASEL0 && attrs.NET_ASEL0 !== 'GND') a.AIRMUX1_SEL_0 = 'ENABLE';
  if (attrs.NET_ASEL1 === 'VCC') a.AIRMUX1_1 = 'ENABLE';
  else if (attrs.NET_ASEL1 && attrs.NET_ASEL1 !== 'GND') a.AIRMUX1_SEL_1 = 'ENABLE';
  if (attrs.NET_BSEL0 === 'VCC') a.BIRMUX1_0 = 'ENABLE';
  else if (attrs.NET_BSEL0 && attrs.NET_BSEL0 !== 'GND') enable(a, 'BIRMUX0_0', 'BIRMUX0_1', 'BIRMUX1_0', 'BIRMUX1_1');
  if (attrs.NET_BSEL1 === 'VCC') a.BIRMUX1_2 = 'ENABLE';
  else if (attrs.NET_BSEL1 && attrs.NET_BSEL1 !== 'GND') enable(a, 'BIRMUX1_2', 'BIRMUX1_3');
  a.MATCH_SHFEN = 'ENABLE'; a.IRASHFEN_0 = '1'; a.IRASHFEN_1 = '1'; a.IRBSHFEN_0 = '1'; a.IRBSHFEN_1 = '1';
  regs0(params, ['A0REG', 'A1REG', 'B0REG', 'B1REG', 'CREG', 'PIPE0_REG', 'PIPE1_REG', 'OUT_REG', 'ASIGN0_REG', 'ASIGN1_REG',
    'ACCLOAD_REG0', 'ACCLOAD_REG1', 'BSIGN0_REG', 'BSIGN1_REG', 'SOA_REG']);
  for (const [parm, val] of Object.entries(params)) {
    if (parm === 'A0REG' || parm === 'A1REG') inReg(a, params, 'A', bin(parm[1]), val, c);
    if (parm === 'B0REG' || parm === 'B1REG') inReg(a, params, 'B', bin(parm[1]), val, c);
    if (parm === 'CREG' && mode === 0) cReg(a, params, val, c);
    if (parm === 'ASIGN0_REG' || parm === 'ASIGN1_REG') signReg(a, params, 'A', bin(parm[5]), val, c);
    if (parm === 'BSIGN0_REG' || parm === 'BSIGN1_REG') signReg(a, params, 'B', bin(parm[5]), val, c);
    if (parm === 'PIPE0_REG' || parm === 'PIPE1_REG') pipeReg(a, params, bin(parm[4]), val, c);
    if (parm === 'SOA_REG') {
      if (val === '0') enable(a, 'IRBY_IRMATCHH_9', 'IRNS_IRMATCHH_9', 'IRBY_IRMATCHL_8', 'IRNS_IRMATCHL_8');
      else {
        ctl(a, 'HMUX_REGSD', c); ctl(a, 'LMUX_REGSD', c);
        if (sync(params)) { a.RSTGENHMUX_REGSD = 'SYNC'; a.RSTGENLMUX_REGSD = 'SYNC'; }
      }
    }
    if (parm === 'OUT_REG') outReg(a, params, val, c);
    if (parm === 'ACCLOAD_REG0') accloadReg(a, params, 1, val, c);
    if (parm === 'ACCLOAD_REG1') accloadReg(a, params, 2, val, c);
  }
}

// the ALU's operation of the MULTADDALU18X18 and MULTALU36X18 by mode: 0 with C, 2 alone, 1 accumulating
function aluMode(a, params, mode, accload) {
  if (mode === 0) {
    a.OPCD_4 = '1'; a.OPCD_5 = '1';
    if ('C_ADD_SUB' in params && bin(params.C_ADD_SUB) === 1) a.OPCD_8 = '1';
  } else if (mode === 2) a.OPCD_5 = '1';
  else if (accload === 'VCC') { a.OPCD_4 = '1'; a.OPCD_6 = '1'; a.OR2CASCADE_EN = 'ENABLE'; }
  else if (accload !== 'GND') enable(a, 'OPCDDYN_4', 'OPCDDYN_6', 'OR2CASCADE_EN');
}

/** set_multalu36x18_attrs: both multipliers as one 36x18 and the ALU; typ and mac for the MULT36X36's output register. */
export function multalu36x18(typ, params, attrs, a, mac) {
  attrsUpper(attrs);
  const c = ctlVals(attrs);
  const mode = bin(params.MULTALU36X18_MODE), accload = attrs.NET_ACCLOAD;
  a.RCISEL_1 = '1'; a.RCISEL_3 = '1';
  orCib(a);
  a.ALU_EN = 'ENABLE';
  unusedIns(a);
  cascade(a, attrs);
  a.OPCD_0 = '1'; a.OPCD_9 = '1';
  aluMode(a, params, mode, accload);
  regs0(params, ['AREG', 'BREG', 'CREG', 'PIPE_REG', 'OUT_REG', 'ASIGN_REG', 'BSIGN_REG', 'ACCLOAD_REG0', 'ACCLOAD_REG1']);
  for (const [parm, val] of Object.entries(params)) {
    if (parm === 'AREG') multalu36Both(a, params, 'A', val, c, inReg);
    if (parm === 'BREG') multalu36Both(a, params, 'B', val, c, inReg);
    if (parm === 'CREG') cReg(a, params, val, c);
    if (parm === 'ASIGN_REG') multalu36Both(a, params, 'A', val, c, signReg);
    if (parm === 'BSIGN_REG') multalu36Both(a, params, 'B', val, c, signReg);
    if (parm === 'PIPE_REG') {
      // (gowin_pack's order: each multiplier's registers, then their synchronous resets)
      if (val === '0') for (let k = 0; k < 2; k++) pipeReg(a, {}, k, val, c);
      else {
        for (let k = 0; k < 2; k++) pipeReg(a, {}, k, val, c);
        if (sync(params)) for (let k = 0; k < 2; k++) {
          a[`RSTGENMUX_ASIGN${k}2`] = 'SYNC'; a[`RSTGENMUX_BSIGN${k}2`] = 'SYNC'; a[`RSTGENLMUX_REGP${k}`] = 'SYNC'; a[`RSTGENHMUX_REGP${k}`] = 'SYNC';
        }
      }
    }
    if (parm === 'OUT_REG') {
      // (the output register the MULT36X36's first macro uses, its low half only)
      if (mac === 0 && typ === 'MULT36X36') {
        enable(a, 'OREG0_NSH_1', 'OREG0_BYPH_1', 'OREG1_NSL_2', 'OREG1_BYPL_2', 'OREG1_NSH_3', 'OREG1_BYPH_3');
        if (val === '0') enable(a, 'OREG0_NSL_0', 'OREG0_BYPL_0');
        else {
          ctl(a, 'LMUX_OREG0', c);
          if (sync(params)) a.RSTGENLMUX_OREG0 = 'SYNC';
        }
      } else outReg(a, params, val, c);
    }
    if (parm === 'ACCLOAD_REG0') accloadReg(a, params, 1, val, c);
    if (parm === 'ACCLOAD_REG1') accloadReg(a, params, 2, val, c);
  }
}
// a register of both multipliers (k 0 and 1), their synchronous resets after both (gowin_pack's order)
function multalu36Both(a, params, ab, val, c, f) {
  for (let k = 0; k < 2; k++) f(a, {}, ab, k, val, c);
  if (val !== '0' && sync(params)) {
    if (f === inReg) for (let k = 0; k < 2; k++) for (const h of 'LH') a[`RSTGEN${h}MUX_REGM${ab}${k}`] = 'SYNC';
    else for (let k = 0; k < 2; k++) a[`RSTGENMUX_${ab}SIGN${k}1`] = 'SYNC';
  }
}

/** set_alu54d_attrs: the ALU alone, A and B its 54-bit operands. */
export function alu54d(params, attrs, a) {
  attrsUpper(attrs);
  a.ALU_EN = 'ENABLE';
  for (let i = 2; i < 7; i++) {
    enable(a, `CPRNS_${i}`, `CPRBY_${i}`);
    if (i > 4) enable(a, `CINNS_${i}`, `CINBY_${i}`);
  }
  a.OPCD_3 = '1'; a.OPCD_9 = '1';
  if (need(params, 'B_ADD_SUB') === '1') a.OPCD_7 = '1';
  cascade(a, attrs);
  const c = ctlVals(attrs), sy = params.ALU_RESET_MODE === 'SYNC';
  const each = f => { for (const i of 'AB') for (const h of 'LH') f(i, h); };
  regs0(params, ['AREG', 'BREG', 'OUT_REG', 'ACCLOAD_REG']);
  for (const [parm, val] of Object.entries(params)) {
    if (parm === 'ALUD_MODE') {
      const ival = bin(val);
      if (ival === 2) { a.OPCD_1 = '1'; a.OPCD_5 = '1'; }
      else {
        if (ival === 0) {
          a.OPCD_6 = '1';
          if (need(params, 'C_ADD_SUB') === '1') a.OPCD_8 = '1';
        } else a.OPCD_5 = '1';
        if (attrs.NET_ACCLOAD === 'GND') { a.OPCD_0 = '1'; a.OPCD_1 = '1'; }
        else if (attrs.NET_ACCLOAD === 'VCC') a.OR2CASCADE_EN = 'ENABLE';
        else enable(a, 'OR2CASCADE_EN', 'OPCDDYN_0', 'OPCDDYN_1', 'OPCDDYN_INV_0', 'OPCDDYN_INV_1');
      }
    }
    if (parm === 'OUT_REG') {
      let ii = 0;
      for (let i = 0; i < 2; i++) for (const h of 'LH') {
        if (val === '0') enable(a, `OREG${i}_NS${h}_${ii}`, `OREG${i}_BYP${h}_${ii}`);
        else ctl(a, `${h}MUX_OREG${i}`, c);
        a[`OR2CIB_EN${i}${h}_${ii}`] = 'ENABLE';
        ii++;
      }
      if (val !== '0' && sy) for (const h of 'HL') for (let i = 0; i < 2; i++) a[`RSTGEN${h}MUX_OREG${i}`] = 'SYNC';
    }
    if (parm === 'AREG' || parm === 'BREG') {
      const k = parm === 'AREG' ? 0 : 1, HL = k ? 'H' : 'L';
      if (val === '0') {
        let ii = 4 * k;
        a[`CIR_BYP${HL}_${k}`] = '1';
        each((i, h) => { enable(a, `IRBY_IREG${k}${i}${h}_${ii}`, `IRNS_IREG${k}${i}${h}_${ii}`); ii++; });
      } else {
        ctl(a, `${HL}MUX_CREG`, c);
        each((i, h) => ctl(a, `${h}MUX_REGM${i}${k}`, c));
        // (BREG's synchronous resets the same as AREG's: gowin_pack's)
        if (sy) { a.RSTGENLMUX_REGC0 = 'SYNC'; each((i, h) => { a[`RSTGEN${h}MUX_REGM${i}0`] = 'SYNC'; }); }
      }
    }
    if (parm === 'ASIGN_REG' || parm === 'BSIGN_REG') {
      const s = parm[0], n = s === 'A' ? 3 : 4;
      if (val === '0') enable(a, `CINBY_${n}`, `CINNS_${n}`);
      else {
        ctl(a, `MUX_${s}SIGN11`, c);
        if (sy) a[`RSTGENMUX_${s}SIGN11`] = 'SYNC';
      }
    }
    if (parm === 'ACCLOAD_REG') {
      if (val === '0') enable(a, 'CINBY_2', 'CINNS_2');
      else {
        ctl(a, 'MUX_ALUSEL1', c);
        if (sy) a.RSTGENMUX_ALUSEL1 = 'SYNC';
      }
    }
  }
  a.RCISEL_1 = '1'; a.RCISEL_3 = '1';
}
const need = (params, k) => { if (!(k in params)) throw new Error(`gowin_pack: the ALU54D has no parameter ${k}`); return params[k]; };

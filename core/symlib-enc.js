// The compositions of the encoders (#4809, part of #4806). A priority encoder of 4 inputs (PENC4_2): A1 = I3 or I2,
// A0 = I3 or (I1 and not I2), V = any input; of 2^n: two of half its size, the upper half's V choosing its address
// (A(n-1) = V of the upper half, the bits below it an M2_1 each between the two halves'), V = the two V's OR. A
// one-hot encoder (ENC4_2): A1 = I2 or I3, A0 = I1 or I3; of 2^n: the two halves' addresses ORed bit by bit. Their
// gates' inputs joined to the inputs by their names. Isomorphic (no DOM).
import { lanes } from './symlib-draw.js';
import { muxTop } from './symlib-mux.js';

const range = n => [...Array(n).keys()];
const G = (type, net) => ({ type, params: { width: 1, bits: false }, net });
const sidesOf = (m, n) => Object.fromEntries([...range(m).map(i => [`I${i}`, 'W']), ...range(n).map(j => [`A${j}`, 'E']), ['V', 'E']]);
const markersOf = (m, n) => [...range(m).map(i => ({ name: `I${i}`, dir: 'in', width: 1 })), ...range(n).map(j => ({ name: `A${j}`, dir: 'out', width: 1 })), { name: 'V', dir: 'out', width: 1 }];

// the 4-input encoders, of gates
function enc4(lib, priority) {
  const name = priority ? 'PENC4_2' : 'ENC4_2';
  return lib.use(name, () => {
    const gates = priority
      ? [G('or2', { I0: 'I3', I1: 'I2', O: 'A1' }), G('inv', { I: 'I2', O: 'n_i2' }), G('and2', { I0: 'I1', I1: 'n_i2', O: 'p1' }), G('or2', { I0: 'I3', I1: 'p1', O: 'A0' }), G('or4', { I0: 'I0', I1: 'I1', I2: 'I2', I3: 'I3', O: 'V' })]
      : [G('or2', { I0: 'I2', I1: 'I3', O: 'A1' }), G('or2', { I0: 'I1', I1: 'I3', O: 'A0' }), G('or4', { I0: 'I0', I1: 'I1', I2: 'I2', I3: 'I3', O: 'V' })];
    return lanes(name, priority ? `${name}: a 4-to-2 priority encoder, A the index of the highest input at 1 (0 when none): A1 = I3 or I2, A0 = I3 or (I1 and not I2); V = some input at 1.`
      : `${name}: a 4-to-2 one-hot encoder, A the OR of the indices of the inputs at 1: A1 = I2 or I3, A0 = I1 or I3; V = some input at 1.`,
    markersOf(4, 2), gates.map(g => ({ ...g, net: pin => g.net[pin] })), sidesOf(4, 2));
  });
}

/** An encoder of 2^n inputs: PENC (priority) or ENC (one-hot). */
function encTree(lib, n, priority) {
  if (n === 2) return enc4(lib, priority);
  const m = 1 << n, h = m / 2, name = `${priority ? 'PENC' : 'ENC'}${m}_${n}`, half = encTree(lib, n - 1, priority);
  const pick = priority ? muxTop(lib, 'mux2', { width: 1, en: false }) : null;
  return lib.use(name, () => {
    const items = [{ mod: half, label: 'U0', net: pin => (pin[0] === 'I' ? pin : `L${pin}`) },
      { mod: half, label: 'U1', net: pin => (pin[0] === 'I' ? `I${h + +pin.slice(1)}` : `H${pin}`) },
      // (each address bit below the top one: the upper half's when its V is 1, else the lower half's; or their OR)
      ...range(n - 1).map(j => (priority ? { mod: pick, label: `U${j + 2}`, net: pin => ({ D0: `LA${j}`, D1: `HA${j}`, S0: 'HV', O: `A${j}` })[pin] }
        : G('or2', { I0: `LA${j}`, I1: `HA${j}`, O: `A${j}` }))),
      G('buf', { I: 'HV', O: `A${n - 1}` }), G('or2', { I0: 'LV', I1: 'HV', O: 'V' })];
    return lanes(name, `${name}: a ${m}-to-${n} ${priority ? 'priority' : 'one-hot'} encoder, two ${half.name} (I0 … I${h - 1}, I${h} … I${m - 1}): A${n - 1} = V of the upper one, ${priority ? `A${n - 2} … A0 the upper one's when its V is 1, else the lower one's (an M2_1 each)` : `A${n - 2} … A0 the OR of theirs`}; V = the OR of their V.`,
    markersOf(m, n), items.map(it => (it.type ? { ...it, net: pin => it.net[pin] } : it)), sidesOf(m, n));
  });
}

/** The top of an encoder's composition (n, mode, bus). */
export function encoderTop(lib, p) {
  const n = p.n, m = 1 << n, cell = encTree(lib, n, p.mode !== 'one-hot');
  if (!p.bus) return cell;
  return lib.use(`${cell.name}_BUS`, () => lanes(`${cell.name}_BUS`, `${cell.name}_BUS: the ${cell.name}, its inputs I and its address A buses.`,
    [{ name: 'I', dir: 'in', width: m }, { name: 'A', dir: 'out', width: n }, { name: 'V', dir: 'out', width: 1 }],
    [{ mod: cell, label: 'U0', net: pin => (pin === 'V' ? 'V' : `${pin[0]}(${pin.slice(1)})`) }]));
}

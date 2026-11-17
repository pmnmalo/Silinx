// Silinx toolchain - a 7-series .bit checked against what it was made of, with no Vivado and no board (#3145): the checks
// Vivado cannot make (it reads no FASM) and the Spartan-3E's byte-identical .bit against ISE's stands for there:
// - its frames the ones Project X-Ray's fasm2frames makes of nextpnr's FASM (roundtrip.js referenceFrames), the part's
//   others zeros;
// - the round trip: its frames read back into features (bit2fasm) and compared with the FASM by bits (roundTrip);
// - its pins: each port's IOB at its XDC pin, with its direction and its IO standard, and no other (pins.js).
// The Vivado checks of the same build (its DRC, timing and utilisation on Silinx's netlist, its write_cfgmem on the .bit)
// are scripts/xc7-vivado-compare.mjs's; both run from scripts/check-xc7.mjs (npm run check:xc7).
import { FRAME_WORDS, readBitFramesXc7 } from './readback.js';
import { referenceFrames, roundTrip } from './roundtrip.js';
import { checkPins, ioConfig } from './pins.js';

/**
 * A .bit (bytes) against the FASM it was made of and, when given, the XDC's pins (pins.js xdcPins'), on the part's index
 * (readback.js bitIndexXc7's): { ok, errors: [message], idcode, frames: { read, reference, differ }, roundTrip (its
 * result but the features), pins (checkPins' or null) }. options: roundTrip's (pudcPullup).
 */
export function checkBitXc7(index, { fasm, bit, pins = null, options = {} }) {
  const errors = [];
  const back = readBitFramesXc7(bit, index);
  if (back.idcode !== index.raw.idcode) errors.push(`the .bit's ID code 0x${back.idcode?.toString(16)}, the part's 0x${index.raw.idcode.toString(16)}`);
  const ref = referenceFrames(index, fasm, options), zeros = new Uint32Array(FRAME_WORDS);
  const same = (a, b) => a.every((x, i) => x === b[i]);
  let differ = 0;
  for (const [a, w] of back.frames) if (!same(w, ref.get(a) ?? zeros)) differ++;
  for (const [a, w] of ref) if (!back.frames.has(a) && !same(w, zeros)) differ++;
  if (differ) errors.push(`${differ} frames not the ones fasm2frames makes of the FASM`);
  const { features, ...rt } = roundTrip(index, fasm, back.frames, options);
  for (const k of ['lost', 'stray', 'unknown', 'missing', 'extra']) if (rt[k].length) errors.push(`round trip: ${rt[k].length} ${k} (${rt[k].slice(0, 3).join('; ')}${rt[k].length > 3 ? '; …' : ''})`);
  const p = pins ? checkPins(index.raw.pins || {}, pins, ioConfig(features)) : null;
  if (p) errors.push(...p.errors.map(e => `pins: ${e}`));
  return { ok: !errors.length, errors, idcode: back.idcode, frames: { read: back.frames.size, reference: ref.size, differ }, roundTrip: rt, pins: p };
}

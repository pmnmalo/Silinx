// Silinx toolchain - 7-series configuration bitstreams (.bit files) from their frames (#3144), as Project X-Ray's
// xc7frames2bit writes them (tools/xc7frames2bit.cc, lib/xilinx/configuration.cc, bitstream_writer.h, frames.h), so
// that the same frames give a byte-identical file.
//
// The configuration packets of UG470 (7 Series FPGAs Configuration User Guide): 32-bit words after the sync word
// AA995566; a Type 1 header [31:29] = 001, [28:27] opcode (0 NOP, 1 read, 2 write), [26:13] the register, [10:0] the
// word count; a Type 2 header [31:29] = 010, [28:27] the opcode, [26:0] the count (its register the Type 1's before).
// A frame address (FAR): [25:23] block type (0 CLB_IO_CLK, 1 BLOCK_RAM, 2 CFG_CLB), [22] the bottom half, [21:17] the
// row, [16:7] the column, [6:0] the minor (the frame of the column). A frame is 101 words; word 50's low 13 bits are its
// ECC, computed here. FDRI's data: every frame of the part in address order (the frames given, the part's others as
// zeros), two frames of zeros after each row of a block type and half, and two at the end. No CRC is written (RCRC
// resets it); the header's fields: the source's name and the generator, the part, the date and time (UTC).
import { FRAME_WORDS } from './frames.js';

/** The configuration registers' addresses (UG470). */
const REG7 = { CRC: 0x00, FAR: 0x01, FDRI: 0x02, FDRO: 0x03, CMD: 0x04, CTL0: 0x05, MASK: 0x06, STAT: 0x07, LOUT: 0x08, COR0: 0x09,
  MFWR: 0x0a, CBC: 0x0b, IDCODE: 0x0c, AXSS: 0x0d, COR1: 0x0e, WBSTAR: 0x10, TIMER: 0x11, UNKNOWN: 0x13, BOOTSTS: 0x16, CTL1: 0x18, BSPI: 0x1f };
/** Commands written to CMD. */
const CMD7 = { NULL: 0, WCFG: 1, MFW: 2, LFRM: 3, RCFG: 4, START: 5, RCAP: 6, RCRC: 7, AGHIGH: 8, SWITCH: 9, GRESTORE: 10, SHUTDOWN: 11,
  GCAPTURE: 12, DESYNC: 13, IPROG: 15 };
const BLOCKS = ['CLB_IO_CLK', 'BLOCK_RAM', 'CFG_CLB'];

/** A frame address's fields: { block, bottom, row, column, minor }. */
export function farFields(a) {
  return { block: (a >>> 23) & 7, bottom: (a >>> 22) & 1, row: (a >>> 17) & 0x1f, column: (a >>> 7) & 0x3ff, minor: a & 0x7f };
}
/** A frame address from its fields. */
export function farOf(block, bottom, row, column, minor) {
  return ((block << 23) | (bottom << 22) | (row << 17) | (column << 7) | minor) >>> 0;
}

/**
 * The part's frame addresses (Part::GetNextFrameAddress, IsValidFrameAddress): { valid(a), next(a) } (next: null after
 * the last). regions: { top | bottom: { <row>: { <block type>: [frames of column 0, 1, …] } } }, the database's.
 */
export function partFrames(regions) {
  const counts = (a, f = farFields(a)) => regions[f.bottom ? 'bottom' : 'top']?.[f.row]?.[BLOCKS[f.block]];
  const valid = a => { const f = farFields(a), c = counts(a, f); return !!c && f.column < c.length && f.minor < c[f.column]; };
  // within a half (GlobalClockRegion, Row, ConfigurationBus, ConfigurationColumn): the column's next frame, else the
  // row's next column, else the half's next row; an address past its column's frames goes on to the next column
  const inHalf = a => {
    const f = farFields(a), half = regions[f.bottom ? 'bottom' : 'top'] || {};
    if (!half[f.row]) return null;
    const c = counts(a, f);
    if (c && f.column < c.length) {
      if (f.minor + 1 < c[f.column]) return a + 1;
      const n = farOf(f.block, f.bottom, f.row, f.column + 1, 0);
      if (valid(n)) return n;
    }
    const next = Object.keys(half).map(Number).sort((x, y) => x - y).find(r => r > f.row);
    if (next === undefined) return null;
    const n = farOf(f.block, f.bottom, next, 0, 0);
    return valid(n) ? n : null;
  };
  const next = a => {
    const f = farFields(a), n = inHalf(a);
    if (n !== null) return n;
    if (!f.bottom) { const b = farOf(f.block, 1, 0, 0, 0); if (valid(b)) return b; }
    if (f.block < 1) { const b = farOf(1, 0, 0, 0, 0); if (valid(b)) return b; }
    if (f.block < 2) { const b = farOf(2, 0, 0, 0, 0); if (valid(b)) return b; }
    return null;
  };
  return { valid, next };
}

/** A frame's ECC (word 50's low 13 bits) set from its words (xc7series::updateECC). */
export function updateEcc(words) {
  let ecc = 0;
  for (let i = 0; i < words.length; i++) {
    let data = i === 0x32 ? words[i] & 0xffffe000 : words[i];
    const val = i * 32 + (i > 0x25 ? 0x1360 : i > 0x6 ? 0x1340 : 0x1320);
    for (let b = 0; b < 32; b++, data >>>= 1) if (data & 1) ecc ^= val + b;
    if (i === 0x64) { let v = ecc & 0xfff; v ^= v >> 8; v ^= v >> 4; v ^= v >> 2; v ^= v >> 1; ecc ^= (v & 1) << 12; }
  }
  words[0x32] = ((words[0x32] & 0xffffe000) | (ecc & 0x1fff)) >>> 0;
  return words;
}

const type1 = (reg, n, op = 2) => ((1 << 29) | (op << 27) | (reg << 13) | n) >>> 0;
const NOP = type1(0, 0, 0);
const write = (reg, value) => [type1(reg, 1), value >>> 0];
const cmd = c => write(REG7.CMD, c);
const nops = n => Array(n).fill(NOP);

/**
 * Where each frame's words are in FDRI's data: { at: Map(frame address → word), length } for the given frame addresses
 * and the part's (Frames::addMissingFrames), in address order, two frames of zeros after each row (where the part's
 * next frame is of another block type, half or row) and at the end (Configuration::createType2ConfigurationPacketData).
 * A frame of the fabric's tiles the part does not have (the xc7a35t's tiles are the xc7a50t's) is written all the same.
 */
function fdriLayout(addresses, part) {
  const all = new Set(addresses);
  for (let a = 0; a !== null; a = part.next(a)) all.add(a);
  const at = new Map();
  let k = 0;
  for (const a of [...all].sort((x, y) => x - y)) {
    at.set(a, k);
    k += FRAME_WORDS;
    const nx = part.next(a);
    if (nx === null) continue;
    const f = farFields(a), x = farFields(nx);
    if (x.block !== f.block || x.bottom !== f.bottom || x.row !== f.row) k += 2 * FRAME_WORDS;
  }
  return { at, length: k + 2 * FRAME_WORDS };
}

/** FDRI's data of the frames (Map(frame address → 101 words), their ECC set), the part's others zeros (fdriLayout). */
export function fdriData(frames, part) {
  const { at, length } = fdriLayout(frames.keys(), part), out = new Uint32Array(length);
  for (const [a, w] of frames) out.set(w, at.get(a));
  return out;
}

/**
 * FDRI's data written compressed (BITSTREAM.GENERAL.COMPRESS), in the packets of Vivado's compressed .bit (2025.2, read
 * on the Basys 3's and the Nexys A7's parts), every frame of the layout (fdriLayout's) written once. FDRI's last frame
 * stays in the frame buffer (UG470's pipeline), which an MFWR writes after a CMD MFW. The frames whose words no other
 * frame has: in runs within a column, in address order (CMD WCFG, FAR, FDRI's frames and one more, the next frame's
 * words, left in the buffer); then each set of frames with the same words (the frames of zeros the most): its words into
 * the buffer at its first frame (FDRI one frame), CMD MFW, 12 NOPs, an MFWR of 8 words (to that first frame), then a FAR
 * and an MFWR of 4 words for each of the others (two NOPs after each MFWR of the block RAM's frames); a set within a row
 * of a block type and half.
 */
function compressedData(frames, part) {
  const { at } = fdriLayout(frames.keys(), part), zeros = new Uint32Array(FRAME_WORDS);
  const list = [...at.keys()], words = a => frames.get(a) || zeros, key = a => words(a).join(',');
  // (a set's frames in one row of a block type and half, as Vivado's)
  const sets = new Map(), setOf = a => `${a >>> 17} ${key(a)}`;
  for (const a of list) { if (!sets.has(setOf(a))) sets.set(setOf(a), []); sets.get(setOf(a)).push(a); }
  const out = [];
  const fdri = (a, frameWords) => {
    const n = frameWords.length * FRAME_WORDS;
    out.push(...cmd(CMD7.WCFG), NOP, ...write(REG7.FAR, a), NOP, ...(n <= 0x7ff ? [type1(REG7.FDRI, n)] : [type1(REG7.FDRI, 0), ((2 << 29) | (2 << 27) | n) >>> 0]));
    for (const w of frameWords) out.push(...w);
  };
  const column = a => a >>> 7, single = a => sets.get(setOf(a)).length === 1;
  for (let i = 0; i < list.length;) {
    if (!single(list[i])) { i++; continue; }
    let j = i + 1;
    while (j < list.length && single(list[j]) && column(list[j]) === column(list[i])) j++;
    fdri(list[i], [...list.slice(i, j).map(words), j < list.length ? words(list[j]) : zeros]);
    i = j;
  }
  for (const [first, ...others] of [...sets.values()].filter(s => s.length > 1)) {
    fdri(first, [words(first)]);
    // (two NOPs after each MFWR of the block RAM's frames)
    const after = farFields(first).block ? nops(2) : [];
    out.push(...cmd(CMD7.MFW), ...nops(12), type1(REG7.MFWR, 8), ...nops(8).fill(0), ...after);
    for (const a of others) out.push(...write(REG7.FAR, a), type1(REG7.MFWR, 4), 0, 0, 0, 0, ...after);
  }
  return out;
}

const COR0 = 0x02003fe5;
// CTL1's bit 12, which Vivado's compressed .bit sets before the frames and clears after LFRM
const CTL1_MFW = 0x1000;   // ConfigurationOptions0Value: DONE in pipelined, DONE at phase 4, GTS 5, GWE 6, no waits

/**
 * The .bit of a part's frames (Map(frame address → 101 words), as fasmToFrames makes them, or readFramesText's): their
 * ECC set, the part's missing frames added, in xc7frames2bit's packets. db: the part's bit database (its regions and ID
 * code). The header: source (the frames' name, xc7frames2bit's --frm_file), generator, part, and the date (yyyy/mm/dd)
 * and time (hh:mm:ss) of `now` in UTC, or the ones given. compress: FDRI's data as compressedData writes it (the XDC's
 * BITSTREAM.GENERAL.COMPRESS TRUE, #3876).
 */
export function bitstreamXc7(frames, db, { source = 'design.frames', generator = 'silinx-fpga', part = db.part, now = new Date(), date, time, compress = false } = {}) {
  const ecc = new Map([...frames].map(([a, w]) => [a, updateEcc(Uint32Array.from(w))]));
  const data = compress ? compressedData(ecc, partFrames(db.regions)) : fdriData(ecc, partFrames(db.regions));
  const before = [NOP, ...write(REG7.TIMER, 0), ...write(REG7.WBSTAR, 0), ...cmd(CMD7.NULL), NOP, ...cmd(CMD7.RCRC), NOP, NOP,
    ...write(REG7.UNKNOWN, 0), ...write(REG7.COR0, COR0), ...write(REG7.COR1, 0), ...write(REG7.IDCODE, db.idcode), ...cmd(CMD7.SWITCH), NOP,
    ...write(REG7.MASK, 0x401), ...write(REG7.CTL0, 0x501), ...write(REG7.MASK, compress ? CTL1_MFW : 0), ...write(REG7.CTL1, compress ? CTL1_MFW : 0), ...nops(8),
    ...(compress ? [] : [...write(REG7.FAR, 0), ...cmd(CMD7.WCFG), NOP, type1(REG7.FDRI, 0), ((2 << 29) | (2 << 27) | data.length) >>> 0])];
  const after = [...cmd(CMD7.RCRC), NOP, NOP, ...cmd(CMD7.GRESTORE), NOP, ...cmd(CMD7.LFRM),
    ...(compress ? [...write(REG7.MASK, CTL1_MFW), ...write(REG7.CTL1, 0)] : []), ...nops(100), ...cmd(CMD7.START), NOP,
    ...write(REG7.FAR, 0x3be0000), ...write(REG7.MASK, 0x501), ...write(REG7.CTL0, 0x501), ...cmd(CMD7.RCRC), NOP, NOP, ...cmd(CMD7.DESYNC), ...nops(400)];
  const sync = [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff, 0x000000bb, 0x11220044,
    0xffffffff, 0xffffffff, 0xaa995566];
  const words = sync.length + before.length + data.length + after.length;

  const pad = n => String(n).padStart(2, '0');
  date ??= `${now.getUTCFullYear()}/${pad(now.getUTCMonth() + 1)}/${pad(now.getUTCDate())}`;
  time ??= `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const field = (key, text) => { const b = new TextEncoder().encode(text); return [key.charCodeAt(0), (b.length + 1) >> 8, (b.length + 1) & 0xff, ...b, 0]; };
  const header = [0x00, 0x09, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x00, 0x00, 0x01, ...field('a', `${source};Generator=${generator}`),
    ...field('b', part), ...field('c', date), ...field('d', time), 'e'.charCodeAt(0)];
  const bytes = new Uint8Array(header.length + 4 + words * 4), view = new DataView(bytes.buffer);
  bytes.set(header);
  view.setUint32(header.length, words * 4);
  let k = header.length + 4;
  for (const list of [sync, before, data, after]) for (const w of list) { view.setUint32(k, w); k += 4; }
  return bytes;
}

/**
 * A .bit's frames read back, as bitstreamXc7 lays them out for the part's database: Map(frame address → 101 words),
 * every frame of the fabric's tiles and of the part. FDRI's data goes from the FAR written before it through the
 * layout's frames and rows (fdriLayout's; its frames of zeros are no frame's), its last frame held in the frame buffer
 * (UG470's pipeline: the frames of zeros at the end flush the others); a compressed .bit's (compressedData's, Vivado's)
 * MFWR writes the frame buffer after a CMD MFW, to the FAR, or with no FAR after FDRI's, to that last frame's address. An error for a file with no frame data, data past the part's
 * frames or another layout's.
 */
export function readBitXc7(bytes, db) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let k = 0;
  while (k + 4 <= bytes.length && view.getUint32(k) !== 0xaa995566) k++;
  if (k + 4 > bytes.length) throw new Error('not a 7-series bitstream: no sync word');
  const addresses = [];
  for (const name of db.tiles()) for (const b of db.tile(name).blocks.values()) for (let i = 0; i < b.frames; i++) addresses.push(b.base + i);
  const { at, length } = fdriLayout(addresses, partFrames(db.regions)), frameAt = new Map([...at].map(([a, w]) => [w, a]));
  const frames = new Map([...at.keys()].map(a => [a, new Uint32Array(FRAME_WORDS)]));
  const words = (from, n) => Uint32Array.from({ length: n }, (_, i) => view.getUint32(from + 4 * i));
  let reg = 0, far = 0, mfw = false, last = null, lastAt = null;
  for (k += 4; k + 4 <= bytes.length;) {
    const h = view.getUint32(k), kind = h >>> 29;
    k += 4;
    if (kind !== 1 && kind !== 2) continue;
    const op = (h >>> 27) & 3, n = kind === 1 ? h & 0x7ff : h & 0x7ffffff;
    if (kind === 1) reg = (h >>> 13) & 0x3fff;
    if (k + 4 * n > bytes.length) throw new Error('not a 7-series bitstream: a packet past the end of the file');
    if (op === 2 && n && reg === REG7.FAR) { far = view.getUint32(k + 4 * (n - 1)); lastAt = null; }
    if (op === 2 && n && reg === REG7.CMD) mfw = view.getUint32(k + 4 * (n - 1)) === CMD7.MFW;
    if (op === 2 && n && reg === REG7.FDRI) {
      const start = at.get(far);
      if (start === undefined) throw new Error(`FDRI's data starts at 0x${far.toString(16)}, not a frame of the ${db.part}`);
      if (n % FRAME_WORDS || start + n > length) throw new Error(`the frame data's ${n} words are not the ${length} of the ${db.part}'s frames`);
      for (let j = 0; j < n; j += FRAME_WORDS) {
        const f = words(k + 4 * j, FRAME_WORDS), a = frameAt.get(start + j);
        // (the last frame stays in the frame buffer: an MFWR writes it)
        if (j + FRAME_WORDS === n) { last = f; lastAt = a ?? null; } else if (a !== undefined) frames.set(a, f);
        else if (f.some(Boolean)) throw new Error(`the frame data's padding at word ${start + j} is not zeros`);
      }
    }
    if (op === 2 && n && reg === REG7.MFWR) {
      if (!mfw || !last) throw new Error('MFWR written with no CMD MFW and frame before it');
      // (the first MFWR, with no FAR after FDRI's: to the address of FDRI's last frame)
      const to = lastAt ?? far;
      if (!at.has(to)) throw new Error(`MFWR at 0x${to.toString(16)}, not a frame of the ${db.part}`);
      frames.set(to, Uint32Array.from(last));
    }
    k += 4 * n;
  }
  if (!last) throw new Error('not a 7-series bitstream: no frame data');
  return frames;
}

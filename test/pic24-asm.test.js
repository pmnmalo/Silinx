// The PIC24 tests' assembler (#5480, test/pic24-asm.mjs) against the reference: every PIC24F instruction form's
// encoding as Microchip's 16-bit MCU and DSC Programmer's Reference Manual (DS70000157G, section 5) gives it, its 24
// bits as the manual writes them (0 and 1 fixed, a letter a field: its bits concatenated from the most significant).
// A sample of each form assembled: its fixed bits the manual's, its fields the values the sample names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pic24Assemble } from './pic24-asm.mjs';

// [the manual's encoding, a sample, its fields]
const FORMS = [
  ['101101000BDfffffffffffff', 'add.b 0x1235', { B: 1, D: 1, f: 0x1235 }],
  ['101101000BDfffffffffffff', 'add 0x800, wreg', { B: 0, D: 0, f: 0x800 }],
  ['101100000Bkkkkkkkkkkdddd', 'add #0x3ff, w7', { B: 0, k: 0x3ff, d: 7 }],
  ['01000wwwwBqqqdddd11kkkkk', 'add.b w2, #0x1f, [w3++]', { w: 2, B: 1, q: 3, d: 3, k: 31 }],
  ['01000wwwwBqqqddddpppssss', 'add w1, [--w5], [++w8]', { w: 1, B: 0, q: 5, d: 8, p: 4, s: 5 }],
  ['101101001BDfffffffffffff', 'addc 0x1000', { B: 0, D: 1, f: 0x1000 }],
  ['101100001Bkkkkkkkkkkdddd', 'addc.b #0xff, w1', { B: 1, k: 0xff, d: 1 }],
  ['01001wwwwBqqqdddd11kkkkk', 'addc w4, #3, w5', { w: 4, q: 0, d: 5, k: 3 }],
  ['01001wwwwBqqqddddpppssss', 'addc.b w0, [w1++], [w2++]', { w: 0, B: 1, q: 3, d: 2, p: 3, s: 1 }],
  ['101101100BDfffffffffffff', 'and.b 0x801, wreg', { B: 1, D: 0, f: 0x801 }],
  ['101100100Bkkkkkkkkkkdddd', 'and #0x2a5, w9', { k: 0x2a5, d: 9 }],
  ['01100wwwwBqqqdddd11kkkkk', 'and w1, #0x10, [w2--]', { w: 1, q: 2, d: 2, k: 16 }],
  ['01100wwwwBqqqddddpppssss', 'and w3, w4, w5', { w: 3, q: 0, d: 5, p: 0, s: 4 }],
  ['101101110BDfffffffffffff', 'ior 0x1ffe', { D: 1, f: 0x1ffe }],
  ['101100110Bkkkkkkkkkkdddd', 'ior #0x101, w0', { k: 0x101, d: 0 }],
  ['01110wwwwBqqqdddd11kkkkk', 'ior w12, #31, w13', { w: 12, d: 13, k: 31 }],
  ['01110wwwwBqqqddddpppssss', 'ior.b w0, [w1], [w2]', { B: 1, q: 1, d: 2, p: 1, s: 1 }],
  ['101101101BDfffffffffffff', 'xor 0x900', { D: 1, f: 0x900 }],
  ['101100101Bkkkkkkkkkkdddd', 'xor #0x0f0, w3', { k: 0xf0, d: 3 }],
  ['01101wwwwBqqqdddd11kkkkk', 'xor.b w4, #0x14, w5', { w: 4, B: 1, d: 5, k: 0x14 }],
  ['01101wwwwBqqqddddpppssss', 'xor w1, w2, w3', { w: 1, d: 3, s: 2 }],
  ['101101010BDfffffffffffff', 'sub 0xa04, wreg', { D: 0, f: 0xa04 }],
  ['101100010Bkkkkkkkkkkdddd', 'sub.b #0x23, w0', { B: 1, k: 0x23, d: 0 }],
  ['01010wwwwBqqqdddd11kkkkk', 'sub w0, #8, [w2++]', { w: 0, q: 3, d: 2, k: 8 }],
  ['01010wwwwBqqqddddpppssss', 'sub w7, [w8++], [w9++]', { w: 7, q: 3, d: 9, p: 3, s: 8 }],
  ['101101011BDfffffffffffff', 'subb.b 0x1fff', { B: 1, D: 1, f: 0x1fff }],
  ['101100011Bkkkkkkkkkkdddd', 'subb #0x3ff, w15', { k: 0x3ff, d: 15 }],
  ['01011wwwwBqqqdddd11kkkkk', 'subb.b w4, #0x10, w5', { w: 4, B: 1, d: 5, k: 16 }],
  ['01011wwwwBqqqddddpppssss', 'subb w0, w1, w0', { w: 0, d: 0, s: 1 }],
  ['101111010BDfffffffffffff', 'subr.b 0x1fff', { B: 1, D: 1, f: 0x1fff }],
  ['00010wwwwBqqqdddd11kkkkk', 'subr w0, #8, [w2++]', { w: 0, q: 3, d: 2, k: 8 }],
  ['00010wwwwBqqqddddpppssss', 'subr w7, [w8++], [w9++]', { w: 7, q: 3, d: 9, p: 3, s: 8 }],
  ['101111011BDfffffffffffff', 'subbr 0xa04, wreg', { D: 0, f: 0xa04 }],
  ['00011wwwwBqqqdddd11kkkkk', 'subbr.b w0, #0x10, w1', { w: 0, B: 1, d: 1, k: 16 }],
  ['00011wwwwBqqqddddpppssss', 'subbr w7, [w8++], [w9++]', { w: 7, q: 3, d: 9, p: 3, s: 8 }],
  ['110101011BDfffffffffffff', 'asr 0x600, wreg', { D: 0, f: 0x600 }],
  ['110100011Bqqqddddpppssss', 'asr.b [w0++], [w1++]', { B: 1, q: 3, d: 1, p: 3, s: 0 }],
  ['110111101wwwwdddd100kkkk', 'asr w0, #4, w6', { w: 0, d: 6, k: 4 }],
  ['110111101wwwwdddd000ssss', 'asr w0, w5, w6', { w: 0, d: 6, s: 5 }],
  ['110101010BDfffffffffffff', 'lsr.b 0x600', { B: 1, D: 1, f: 0x600 }],
  ['110100010Bqqqddddpppssss', 'lsr w0, w1', { d: 1, s: 0 }],
  ['110111100wwwwdddd100kkkk', 'lsr w4, #15, w5', { w: 4, d: 5, k: 15 }],
  ['110111100wwwwdddd000ssss', 'lsr w4, w3, w5', { w: 4, d: 5, s: 3 }],
  ['110101000BDfffffffffffff', 'sl.b 0x909', { B: 1, D: 1, f: 0x909 }],
  ['110100000Bqqqddddpppssss', 'sl w1, [w2]', { q: 1, d: 2, s: 1 }],
  ['110111010wwwwdddd100kkkk', 'sl w1, #1, w2', { w: 1, d: 2, k: 1 }],
  ['110111010wwwwdddd000ssss', 'sl w1, w9, w2', { w: 1, d: 2, s: 9 }],
  ['110101101BDfffffffffffff', 'rlc 0x1222', { D: 1, f: 0x1222 }],
  ['110100101Bqqqddddpppssss', 'rlc.b w0, w3', { B: 1, d: 3, s: 0 }],
  ['110101100BDfffffffffffff', 'rlnc 0x1222, wreg', { D: 0, f: 0x1222 }],
  ['110100100Bqqqddddpppssss', 'rlnc [w2++], [w8]', { q: 1, d: 8, p: 3, s: 2 }],
  ['110101111BDfffffffffffff', 'rrc.b 0x1223', { B: 1, D: 1, f: 0x1223 }],
  ['110100111Bqqqddddpppssss', 'rrc w4, w5', { d: 5, s: 4 }],
  ['110101110BDfffffffffffff', 'rrnc 0x800', { D: 1, f: 0x800 }],
  ['110100110Bqqqddddpppssss', 'rrnc.b [--w4], w6', { B: 1, d: 6, p: 4, s: 4 }],
  ['10101001bbbffffffffffffb', 'bclr 0x800, #11', { b: 11, f: 0x400 }],
  ['10100001bbbb0B000pppssss', 'bclr.b [w3++], #7', { b: 7, B: 1, p: 3, s: 3 }],
  ['10101000bbbffffffffffffb', 'bset.b 0x801, #2', { b: 10, f: 0x400 }],
  ['10100000bbbb0B000pppssss', 'bset w2, #15', { b: 15, B: 0, p: 0, s: 2 }],
  ['10101010bbbffffffffffffb', 'btg 0x1000, #0', { b: 0, f: 0x800 }],
  ['10100010bbbb0B000pppssss', 'btg w1, #4', { b: 4, s: 1 }],
  ['10101111bbbffffffffffffb', 'btsc 0x1200, #9', { b: 9, f: 0x900 }],
  ['10100111bbbb00000pppssss', 'btsc w6, #0xf', { b: 15, s: 6 }],
  ['10101110bbbffffffffffffb', 'btss 0x890, #9', { b: 9, f: 0x448 }],
  ['10100110bbbb00000pppssss', 'btss [w6++], #0xc', { b: 12, p: 3, s: 6 }],
  ['10101011bbbffffffffffffb', 'btst 0x1200, #3', { b: 3, f: 0x900 }],
  ['10100011bbbbZ0000pppssss', 'btst.c [w0++], #3', { b: 3, Z: 0, p: 3, s: 0 }],
  ['10100011bbbbZ0000pppssss', 'btst.z w0, #7', { b: 7, Z: 1, s: 0 }],
  ['10100101Zwwww0000pppssss', 'btst.c w2, w3', { Z: 0, w: 3, s: 2 }],
  ['10101100bbbffffffffffffb', 'btsts 0x808, #15', { b: 15, f: 0x404 }],
  ['10100100bbbbZ0000pppssss', 'btsts.z w0, #7', { b: 7, Z: 1, s: 0 }],
  ['10101101Zwwww0000pppssss', 'bsw.c w2, w3', { Z: 0, w: 3, s: 2 }],
  ['10101101Zwwww0000pppssss', 'bsw.z [++w0], w6', { Z: 1, w: 6, p: 5, s: 0 }],
  ['00110111nnnnnnnnnnnnnnnn', 'bra 0x1010', { n: 7 }],
  ['00000001011000000000ssss', 'bra w7', { s: 7 }],
  ['00110001nnnnnnnnnnnnnnnn', 'bra c, 0x1000', { n: 0xffff }],
  ['00111101nnnnnnnnnnnnnnnn', 'bra ge, 0x1006', { n: 2 }],
  ['00110001nnnnnnnnnnnnnnnn', 'bra geu, 0x1004', { n: 1 }],
  ['00111100nnnnnnnnnnnnnnnn', 'bra gt, 0x1004', { n: 1 }],
  ['00111110nnnnnnnnnnnnnnnn', 'bra gtu, 0x1004', { n: 1 }],
  ['00110100nnnnnnnnnnnnnnnn', 'bra le, 0x1004', { n: 1 }],
  ['00110110nnnnnnnnnnnnnnnn', 'bra leu, 0x1004', { n: 1 }],
  ['00110101nnnnnnnnnnnnnnnn', 'bra lt, 0x1004', { n: 1 }],
  ['00111001nnnnnnnnnnnnnnnn', 'bra ltu, 0x1004', { n: 1 }],
  ['00110011nnnnnnnnnnnnnnnn', 'bra n, 0x1004', { n: 1 }],
  ['00111001nnnnnnnnnnnnnnnn', 'bra nc, 0x1004', { n: 1 }],
  ['00111011nnnnnnnnnnnnnnnn', 'bra nn, 0x1004', { n: 1 }],
  ['00111000nnnnnnnnnnnnnnnn', 'bra nov, 0x1004', { n: 1 }],
  ['00111010nnnnnnnnnnnnnnnn', 'bra nz, 0x0ffe', { n: 0xfffe }],
  ['00110000nnnnnnnnnnnnnnnn', 'bra ov, 0x1004', { n: 1 }],
  ['00110010nnnnnnnnnnnnnnnn', 'bra z, 0x1004', { n: 1 }],
  ['00000010nnnnnnnnnnnnnnn0', 'call 0x072000', { n: 0x1000 }],
  ['00000001000000000000ssss', 'call w4', { s: 4 }],
  ['111011110BDfffffffffffff', 'clr.b 0x801', { B: 1, D: 1, f: 0x801 }],
  ['111010110Bqqqdddd0000000', 'clr [w2++]', { q: 3, d: 2 }],
  ['111111100110000000000000', 'clrwdt', {}],
  ['111011101BDfffffffffffff', 'com 0x1000, wreg', { D: 0, f: 0x1000 }],
  ['111010101Bqqqddddpppssss', 'com.b w3, [w4++]', { B: 1, q: 3, d: 4, s: 3 }],
  ['111000110B0fffffffffffff', 'cp 0x1200', { B: 0, f: 0x1200 }],
  ['111000010wwwwB00011kkkkk', 'cp.b w4, #0x12', { w: 4, B: 1, k: 0x12 }],
  ['111000010wwwwB000pppssss', 'cp.b w0, [w1++]', { w: 0, B: 1, p: 3, s: 1 }],
  ['111000100B0fffffffffffff', 'cp0 0x1ffe', { f: 0x1ffe }],
  ['1110000000000B000pppssss', 'cp0.b [w4--]', { B: 1, p: 2, s: 4 }],
  ['111000111B0fffffffffffff', 'cpb.b 0x1201', { B: 1, f: 0x1201 }],
  ['111000011wwwwB00011kkkkk', 'cpb w12, #0x1f', { w: 12, k: 31 }],
  ['111000011wwwwB000pppssss', 'cpb w4, w5', { w: 4, s: 5 }],
  ['111001111wwwwB000000ssss', 'cpseq.b w0, w1', { w: 0, B: 1, s: 1 }],
  ['111001100wwwwB000000ssss', 'cpsgt w8, w9', { w: 8, s: 9 }],
  ['111001101wwwwB000000ssss', 'cpslt.b w8, w9', { w: 8, B: 1, s: 9 }],
  ['111001110wwwwB000000ssss', 'cpsne w2, w3', { w: 2, s: 3 }],
  ['11111101010000000000ssss', 'daw.b w3', { s: 3 }],
  ['111011010BDfffffffffffff', 'dec.b 0x200', { B: 1, D: 1, f: 0x200 }],
  ['111010010Bqqqddddpppssss', 'dec w5, [w6++]', { q: 3, d: 6, s: 5 }],
  ['111011011BDfffffffffffff', 'dec2 0x200, wreg', { D: 0, f: 0x200 }],
  ['111010011Bqqqddddpppssss', 'dec2.b [w7--], [w8--]', { B: 1, q: 2, d: 8, p: 2, s: 7 }],
  ['1111110000kkkkkkkkkkkkkk', 'disi #100', { k: 100 }],
  ['110110000ttttvvvvW00ssss', 'div.s w3, w4', { t: 0, v: 3, W: 0, s: 4 }],
  ['110110000ttttvvvvW00ssss', 'div.sd w0, w12', { t: 1, v: 0, W: 1, s: 12 }],
  ['110110001ttttvvvvW00ssss', 'div.u w2, w4', { t: 0, v: 2, W: 0, s: 4 }],
  ['110110001ttttvvvvW00ssss', 'div.ud w10, w12', { t: 11, v: 10, W: 1, s: 12 }],
  ['1111110100000dddd000ssss', 'exch w1, w9', { d: 9, s: 1 }],
  ['1101111100000ddddpppssss', 'fbcl [w1++], w9', { d: 9, p: 3, s: 1 }],
  ['1100111110000ddddpppssss', 'ff1l w2, w5', { d: 5, s: 2 }],
  ['1100111100000ddddpppssss', 'ff1r [w1++], w9', { d: 9, p: 3, s: 1 }],
  ['00000100nnnnnnnnnnnnnnn0', 'goto 0x027844', { n: 0x3c22 }],
  ['00000001010000000000ssss', 'goto w4', { s: 4 }],
  ['111011000BDfffffffffffff', 'inc.b 0x1000', { B: 1, D: 1, f: 0x1000 }],
  ['111010000Bqqqddddpppssss', 'inc.b w1, [++w2]', { B: 1, q: 5, d: 2, s: 1 }],
  ['111011001BDfffffffffffff', 'inc2 0x1000, wreg', { D: 0, f: 0x1000 }],
  ['111010001Bqqqddddpppssss', 'inc2 w1, w2', { d: 2, s: 1 }],
  ['1111101000kkkkkkkkkkkkk0', 'lnk #0xa0', { k: 0x50 }],
  ['101111111BDfffffffffffff', 'mov.b 0x1001, wreg', { B: 1, D: 0, f: 0x1001 }],
  ['101111111BDfffffffffffff', 'mov 0x1000', { B: 0, D: 1, f: 0x1000 }],
  ['101101111B1fffffffffffff', 'mov.b wreg, 0x801', { B: 1, f: 0x801 }],
  ['10000fffffffffffffffdddd', 'mov 0x5000, w4', { f: 0x2800, d: 4 }],
  ['10001fffffffffffffffssss', 'mov w4, 0x7ffe', { f: 0x3fff, s: 4 }],
  ['101100111100kkkkkkkkdddd', 'mov.b #0x17, w5', { k: 0x17, d: 5 }],
  ['0010kkkkkkkkkkkkkkkkdddd', 'mov #0xabcd, w11', { k: 0xabcd, d: 11 }],
  ['10010kkkkBkkkddddkkkssss', 'mov.b [w8+0x13], w10', { k: 0x13, B: 1, d: 10, s: 8 }],
  ['10010kkkkBkkkddddkkkssss', 'mov [w4+0x3e8], w2', { k: 0x1f4, B: 0, d: 2, s: 4 }],
  ['10011kkkkBkkkddddkkkssss', 'mov w4, [w5-0x200]', { k: 0x300, B: 0, d: 5, s: 4 }],
  ['01111wwwwBhhhddddgggssss', 'mov.b [w0--], w4', { B: 1, h: 0, d: 4, g: 2, s: 0 }],
  ['01111wwwwBhhhddddgggssss', 'mov [w6++], [w2+w3]', { w: 3, h: 6, d: 2, g: 3, s: 6 }],
  ['1011111000000ddd0pppssss', 'mov.d [w7--], w4', { d: 2, p: 2, s: 7 }],
  ['1011111000000ddd0pppssss', 'mov.d w2, w6', { d: 3, p: 0, s: 2 }],
  ['101111000B0fffffffffffff', 'mul.b 0x800', { B: 1, f: 0x800 }],
  ['101110011wwwwddddpppssss', 'mul.ss w0, w1, w12', { w: 0, d: 12, s: 1 }],
  ['101110010wwwwdddd11kkkkk', 'mul.su w2, #0x10, w0', { w: 2, d: 0, k: 16 }],
  ['101110010wwwwddddpppssss', 'mul.su w8, [w9], w0', { w: 8, d: 0, p: 1, s: 9 }],
  ['101110001wwwwddddpppssss', 'mul.us w0, [w1], w2', { w: 0, d: 2, p: 1, s: 1 }],
  ['101110000wwwwdddd11kkkkk', 'mul.uu w0, #0xf, w12', { w: 0, d: 12, k: 15 }],
  ['101110000wwwwddddpppssss', 'mul.uu w4, w0, w2', { w: 4, d: 2, s: 0 }],
  ['111011100BDfffffffffffff', 'neg.b 0x880, wreg', { B: 1, D: 0, f: 0x880 }],
  ['111010100Bqqqddddpppssss', 'neg [w2++], [--w4]', { q: 4, d: 4, p: 3, s: 2 }],
  ['00000000xxxxxxxxxxxxxxxx', 'nop', {}],
  ['11111111xxxxxxxxxxxxxxxx', 'nopr', {}],
  ['11111001fffffffffffffff0', 'pop 0x1230', { f: 0x918 }],
  ['01111wwww0hhhdddd1001111', 'pop w4', { h: 0, d: 4 }],
  ['1011111000000ddd01001111', 'pop.d w6', { d: 3 }],
  ['111111101000000000000000', 'pop.s', {}],
  ['11111000fffffffffffffff0', 'push 0x2004', { f: 0x1002 }],
  ['10111110100111111000sss0', 'push.d w6', { s: 3 }],
  ['111111101010000000000000', 'push.s', {}],
  ['11111110010000000000000k', 'pwrsav #1', { k: 1 }],
  ['00000111nnnnnnnnnnnnnnnn', 'rcall 0x1000', { n: 0xffff }],
  ['00000001001000000000ssss', 'rcall w2', { s: 2 }],
  ['0000100100kkkkkkkkkkkkkk', 'repeat #0x3ff', { k: 0x3ff }],
  ['00001001100000000000ssss', 'repeat w4', { s: 4 }],
  ['111111100000000000000000', 'reset', {}],
  ['000001100100000000000000', 'retfie', {}],
  ['000001010Bkkkkkkkkkkdddd', 'retlw.b #0xff, w5', { B: 1, k: 0xff, d: 5 }],
  ['000001100000000000000000', 'return', {}],
  ['1111101100000ddddpppssss', 'se [w2++], w12', { d: 12, p: 3, s: 2 }],
  ['111011111BDfffffffffffff', 'setm.b 0x900, wreg', { B: 1, D: 0, f: 0x900 }],
  ['111010111Bqqqdddd0000000', 'setm [--w6]', { q: 4, d: 6 }],
  ['111111011B0000000000ssss', 'swap.b w0', { B: 1, s: 0 }],
  ['101110101Bqqqddddpppssss', 'tblrdh [w0], w1', { q: 0, d: 1, p: 1, s: 0 }],
  ['101110100Bqqqddddpppssss', 'tblrdl.b [w0++], [w1++]', { B: 1, q: 3, d: 1, p: 3, s: 0 }],
  ['101110111Bqqqddddpppssss', 'tblwth w2, [w1]', { q: 1, d: 1, s: 2 }],
  ['101110110Bqqqddddpppssss', 'tblwtl.b w0, [w1++]', { B: 1, q: 3, d: 1, s: 0 }],
  ['111110101000000000000000', 'ulnk', {}],
  ['111111100010000000000000', 'bootswp', {}],
  ['1111101110000ddddpppssss', 'ze w3, w4', { d: 4, s: 3 }],
];

// a word's fields by the pattern's letters, and whether its fixed bits are the pattern's
function fields(pattern, word) {
  const out = {};
  let fixed = true;
  for (let i = 0; i < 24; i++) {
    const ch = pattern[i], bit = (word >> (23 - i)) & 1;
    if (ch === '0' || ch === '1') { if (+ch !== bit) fixed = false; } else if (ch !== 'x') out[ch] = ((out[ch] ?? 0) << 1) | bit;
  }
  return { fixed, out };
}

test('#5480 the assembler\'s encodings: every PIC24F form\'s fixed bits and fields, as DS70000157 encodes them', () => {
  const bad = [];
  for (const [pattern, line, want] of FORMS) {
    assert.equal(pattern.length, 24, pattern);
    const { words } = pic24Assemble([line], { org: 0x1000 });
    const { fixed, out } = fields(pattern, words[0]);
    const diff = Object.entries(want).filter(([k, v]) => out[k] !== v);
    if (!fixed || diff.length) bad.push(`${line}: 0x${words[0].toString(16)} against ${pattern} (${diff.map(([k, v]) => `${k} ${out[k]} not ${v}`).join(', ')})`);
  }
  assert.deepEqual(bad, []);
});

test('#5480 the assembler: CALL and GOTO\'s second word, PUSH and POP as MOV, labels, .word, .org', () => {
  // CALL lit23: its second word 0x0000nn, lit23<22:16> (DS70000157 CALL)
  assert.deepEqual([...pic24Assemble(['call 0x072000']).words], [0x022000, 0x000007]);
  assert.deepEqual([...pic24Assemble(['goto 0x027844']).words], [0x047844, 0x000002]);
  // PUSH Ws is MOV Ws, [W15++]; POP Wd is MOV [--W15], Wd
  assert.deepEqual([...pic24Assemble(['push w3', 'pop w4', 'push [w2++]']).words], [0x781f83, 0x78024f, 0x781fb2]);
  const { words, labels } = pic24Assemble(['start: mov #1, w0', 'loop: dec w0, w0', 'bra nz, loop', '.word 0x123456', '.org 0x10', 'end: bra end'], { org: 0 });
  assert.deepEqual(labels, { start: 0, loop: 2, end: 0x10 });
  assert.deepEqual([...words], [0x200010, 0xe90000, 0x3afffe, 0x123456, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x37ffff]);
  // SFR names, sums of labels and numbers, the literals' ranges
  assert.equal(pic24Assemble(['mov w0, splim']).words[0], 0x880100);
  assert.equal(pic24Assemble(['bset.b sr+1, #0']).words[0], 0xa88042);   // (a byte's bit 0 at 0x43: the word's bit 8)
  assert.throws(() => pic24Assemble(['add.b #256, w0']), /lit10 256 not in 0\.\.255/);
  assert.throws(() => pic24Assemble(['add w0, #32, w1']), /lit5 32 not in 0\.\.31/);
  assert.throws(() => pic24Assemble(['mov [w1+1], w2']), /a word's offset is even/);
  assert.throws(() => pic24Assemble(['frob w0']), /no instruction FROB/);
  assert.throws(() => pic24Assemble(['bra nowhere']), /unknown symbol: nowhere/);
});

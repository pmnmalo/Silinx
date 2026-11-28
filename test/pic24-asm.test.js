// The PIC24 tests' assembler (#5480, test/pic24-asm.mjs) against the reference: every PIC24F instruction form's
// encoding as Microchip's 16-bit MCU and DSC Programmer's Reference Manual (DS70000157G, section 5) gives it, its 24
// bits as the manual writes them (0 and 1 fixed, a letter a field: its bits concatenated from the most significant).
// A sample of each form assembled: its fixed bits the manual's, its fields the values the sample names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pic24Assemble } from './pic24-asm.mjs';

// [the manual's encoding, a sample, its fields] (a bit instruction on f: the manual's bbbf…fb, its last b `c` here,
// bit4<3>, and bbb bit4<2:0>, as XC16 encodes them: `bclr.b 0x6a7, #5` 0xA9A6A7, a byte's address's LSB there, #6017)
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
  ['10101001bbbffffffffffffc', 'bclr 0x800, #11', { b: 3, c: 1, f: 0x400 }],
  ['10100001bbbb0B000pppssss', 'bclr.b [w3++], #7', { b: 7, B: 1, p: 3, s: 3 }],
  ['10101000bbbffffffffffffc', 'bset.b 0x801, #2', { b: 2, c: 1, f: 0x400 }],
  ['10100000bbbb0B000pppssss', 'bset w2, #15', { b: 15, B: 0, p: 0, s: 2 }],
  ['10101010bbbffffffffffffc', 'btg 0x1000, #0', { b: 0, c: 0, f: 0x800 }],
  ['10100010bbbb0B000pppssss', 'btg w1, #4', { b: 4, s: 1 }],
  ['10101111bbbffffffffffffc', 'btsc 0x1200, #9', { b: 1, c: 1, f: 0x900 }],
  ['10100111bbbb00000pppssss', 'btsc w6, #0xf', { b: 15, s: 6 }],
  ['10101110bbbffffffffffffc', 'btss 0x890, #9', { b: 1, c: 1, f: 0x448 }],
  ['10100110bbbb00000pppssss', 'btss [w6++], #0xc', { b: 12, p: 3, s: 6 }],
  ['10101011bbbffffffffffffc', 'btst 0x1200, #3', { b: 3, c: 0, f: 0x900 }],
  ['10100011bbbbZ0000pppssss', 'btst.c [w0++], #3', { b: 3, Z: 0, p: 3, s: 0 }],
  ['10100011bbbbZ0000pppssss', 'btst.z w0, #7', { b: 7, Z: 1, s: 0 }],
  ['10100101Zwwww0000pppssss', 'btst.c w2, w3', { Z: 0, w: 3, s: 2 }],
  ['10101100bbbffffffffffffc', 'btsts 0x808, #15', { b: 7, c: 1, f: 0x404 }],
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
  const { words, labels } = pic24Assemble(['start: mov #1, w0', 'loop: dec w0, w0', 'bra nz, loop', '.pword 0x123456', '.org 0x10', 'end: bra end'], { org: 0 });
  assert.deepEqual(labels, { start: 0, loop: 2, end: 0x10 });
  assert.deepEqual([...words], [0x200010, 0xe90000, 0x3afffe, 0x123456, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0x37ffff]);
  // SFR names, sums of labels and numbers, the literals' ranges
  assert.equal(pic24Assemble(['mov w0, splim']).words[0], 0x880100);
  assert.equal(pic24Assemble(['bset.b sr+1, #0']).words[0], 0xa80043);   // (a byte's bit 0 at 0x43: the word's bit 8, its bit4<3> op<0>)
  assert.throws(() => pic24Assemble(['add.b #256, w0']), /lit10 256 not in 0\.\.255/);
  assert.throws(() => pic24Assemble(['add w0, #32, w1']), /lit5 32 not in 0\.\.31/);
  assert.throws(() => pic24Assemble(['mov [w1+1], w2']), /a word's offset is even/);
  assert.throws(() => pic24Assemble(['frob w0']), /no instruction FROB/);
  assert.throws(() => pic24Assemble(['bra nowhere']), /unknown symbol: nowhere/);
});

// #5930: the assembler is silinx-pic24's; its errors are collected by line, a label defined twice refused (#5893)
test('#5930 silinx-pic24 exports the assembler; the tests\' helper is the same function', async () => {
  const api = await import('../packages/silinx-pic24/src/index.js');
  assert.equal(api.pic24Assemble, pic24Assemble);
  const r = api.assemble(['main: mov #0x1234, w0', 'bra main'], { file: 'blink.s' });
  assert.deepEqual([...r.words], [0x212340, 0x37fffe]);
  assert.deepEqual(r.labels, { main: 0 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);   // no warnings
});

test('#5930 a label defined twice is refused, naming both lines; a branch no longer jumps silently into the last one', async () => {
  const { assemble } = await import('../packages/silinx-pic24/src/index.js');
  const src = ['start: mov #1, w0', 'wait: dec w0, w0', 'bra nz, wait', '', 'wait: nop', 'bra start'];
  const r = assemble(src, { file: 'lock.s' });
  assert.deepEqual(r.errors, [{ file: 'lock.s', line: 5, message: 'the label \'wait\' is defined twice: at line 2 and at line 5' }]);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.labels.wait, 2);   // (its first place kept)
  assert.throws(() => pic24Assemble(src), /^Error: line 5: the label 'wait' is defined twice: at line 2 and at line 5$/);
  // two labels on one line are two labels, not a repeat
  assert.deepEqual(assemble(['a: b: nop', 'bra a', 'bra b']).errors, []);
});

test('#5930 every line\'s error is reported with its file and line, the later lines assembled though an earlier one failed', async () => {
  const { assemble, asmMessage } = await import('../packages/silinx-pic24/src/index.js');
  const r = assemble(['mov #1, w0', 'frob w1', 'add w0, #32, w1', 'loop: bra loop', 'bra nowhere', '.org 1'], { file: 'x.s' });
  assert.deepEqual(r.errors.map(asmMessage), [
    'x.s:2: no instruction FROB: frob w1',
    'x.s:3: add w0, #32, w1: lit5 32 not in 0..31',
    'x.s:5: bra nowhere: unknown symbol: nowhere',
    'x.s:6: .org 1: not an even address after 0x4',
  ]);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.labels.loop, 2);   // (a failed line takes no word: the next ones placed as if it were not there)
  assert.equal(asmMessage({ file: '', line: 3, message: 'm' }), 'line 3: m');
  // a branch out of reach
  const far = assemble(['bra far', '.org 0x10002', 'far: nop']);
  assert.deepEqual(far.errors.map(asmMessage), ['line 1: bra far: branch 32768 not in -32768..32767']);
});

// #5931: xc16-as's syntax, the PIC24FJ1024GB610's names, the configuration words and XC16's linker's places
const XC16 = (body) => ['    .include "p24FJ1024GB610.inc"', '    config __FWDT, FWDTEN_OFF', '    .global __reset', '    .text', '__reset:', ...body];

test('#5931 the device\'s names and xc16-as\'s expressions', async () => {
  const { assemble, asmMessage } = await import('../packages/silinx-pic24/src/index.js');
  // (each name and expression its number's words: the encodings themselves are the manual's, above)
  const same = (a, b) => { const x = assemble(a, { file: 'n.s' }), y = assemble(b); assert.deepEqual(x.errors.map(asmMessage), []); assert.deepEqual([...x.words], [...y.words], a.join(' | ')); };
  same(['mov w0, TRISA', 'bclr IFS0, #T1IF', 'bset U2STA, #UTXEN', 'mov w1, RPINR19', 'btss PORTD, #RD6', 'bset IEC1, #U2RXIE', 'mov w2, PR1', 'bset T1CON, #TON'],
    ['mov w0, 0x0662', 'bclr 0x0088, #3', 'bset 0x03b0, #10', 'mov w1, 0x07b6', 'btss 0x06a0, #6', 'bset 0x009a, #14', 'mov w2, 0x0192', 'bset 0x0194, #15']);
  same(['mov #tblpage(tab), w0', 'mov #tbloffset(tab), w1', 'mov #(1 << 4) | 0x3, w2', 'mov #~0x00ff & 0xffff, w3', '.equ PERIOD, 20000 - 1', 'mov #PERIOD, w4',
    'mov #(PERIOD / 2) % 7, w5', 'mov #handle(tab), w6', 'tab: .pword 0x123456'],
  ['mov #0, w0', 'mov #0x0e, w1', 'mov #19, w2', 'mov #0xff00, w3', 'mov #19999, w4', 'mov #3, w5', 'mov #0x0e, w6', '.pword 0x123456']);
  assert.deepEqual(assemble(['mov #psvpage(x), w0', 'x: nop', 'mov #(1 +, w0', 'mov #nothing, w0'], { file: 'n.s' }).errors.map(asmMessage),
    ['n.s:1: mov #psvpage(x), w0: psvpage(): not supported yet', 'n.s:3: mov #(1 +, w0: an expression ends too soon: (1 +', 'n.s:4: mov #nothing, w0: unknown symbol: nothing']);
});

test('#6025 a name the .inc gives a register and its bit field (DSRPAG…): the field\'s position, as xc16-as reads it, said; the register _DSRPAG; an .equ\'s own', async () => {
  const { assemble, asmMessage, assembleProgram } = await import('../packages/silinx-pic24/src/index.js');
  const { FIELD_NAMES } = await import('../packages/silinx-pic24/src/gb610-names.js');
  // (XC16 2.10's words for uart-fpga-pic24's `mov w0, DSRPAG` and `mov w0, DSWPAG`: f 0, W0 itself written)
  const r = assemble(['mov w0, DSRPAG', 'mov w0, _DSRPAG', 'mov w0, dswpag', 'mov w0, _DSWPAG', 'mov #NVMADR, w1', 'mov w0, _LATA'], { file: 'p.s' });
  assert.deepEqual([...r.words].map((w) => w.toString(16)), ['880000', '880190', '880000', '8801a0', '200011', '883330']);
  assert.deepEqual(r.warnings.map(asmMessage), [
    'p.s:1: \'DSRPAG\' is 0 here, as xc16-as reads it: XC16\'s p24FJ1024GB610.inc makes it the position of the register\'s bit field DSRPAG, not the register at 0x0032 (_DSRPAG)',
    'p.s:3: \'dswpag\' is 0 here, as xc16-as reads it: XC16\'s p24FJ1024GB610.inc makes it the position of the register\'s bit field DSWPAG, not the register at 0x0034 (_DSWPAG)',
    'p.s:5: \'NVMADR\' is 1 here, as xc16-as reads it: XC16\'s p24FJ1024GB610.inc makes it the position of the register\'s bit field NVMADR, not the register at 0x0762 (_NVMADR)',
  ]);
  assert.deepEqual(r.errors, []);
  // (the 27 names, XC16 2.10's: each its constant, with its warning; its register as _NAME)
  assert.equal(Object.keys(FIELD_NAMES).length, 27);
  for (const [name, [v, at]] of Object.entries(FIELD_NAMES)) {
    const x = assemble([`mov #${name}, w2`, `mov #_${name}, w3`]);
    assert.deepEqual([...x.words], [0x200002 | (v << 4), 0x200003 | (at << 4)], name);
    assert.equal(x.warnings.length, 1, name);
  }
  // (a program's own .equ, or its symbols, of the name: theirs, nothing said)
  const own = assemble(['.equ TBLPAG, 0x54', 'mov w0, TBLPAG']), given = assemble(['mov w0, DISICNT'], { symbols: { DISICNT: 0x52 } });
  assert.deepEqual([[...own.words], own.warnings, [...given.words], given.warnings], [[0x8802a0], [], [0x880290], []]);
  // (the uart-fpga-pic24 example names the registers _DSRPAG and _DSWPAG: no warning, its words the register's)
  const fs = await import('node:fs');
  const ex = assembleProgram(fs.readFileSync(new URL('../examples/uart-fpga-pic24/pic/lcd_uart.asm', import.meta.url), 'utf8'), { file: 'lcd_uart.asm' });
  assert.deepEqual([ex.errors, ex.warnings], [[], []]);
  assert.ok([...ex.words].includes(0x880190) && [...ex.words].includes(0x8801a0) && ![...ex.words].includes(0x880000));
});

test('#5931 the sections: .text\'s instructions, .bss\'s data labels (.space), .word 16 bits and .pword 24, .align, .end', async () => {
  const { assemble, asmMessage } = await import('../packages/silinx-pic24/src/index.js');
  const r = assemble(['.bss', 'count: .space 2', 'buf: .space 8', '.align 4', 'last: .space 1', '.text', 'mov count, w0', 'mov w0, buf+2', '.word 0xbeef, 5', '.pword 0xabcdef', '.align 8', 'nop', '.end', 'frob']);
  assert.deepEqual(r.errors.map(asmMessage), []);
  assert.deepEqual(r.labels, { count: 0x0800, buf: 0x0802, last: 0x080c });
  assert.deepEqual([...r.words], [...assemble(['mov 0x0800, w0', 'mov w0, 0x0804']).words, 0x00beef, 0x000005, 0xabcdef, 0xffffff, 0xffffff, 0xffffff, 0x000000]);
  assert.deepEqual(assemble(['.word 0x10000', '.data', '.section .const', '.bss', 'nop', '.space 2', '.include "p30F4011.inc"', '.frob', '.text', '.space 2'], { file: 's.s' }).errors.map(asmMessage), [
    's.s:1: .word 65536 not in -32768..65535',
    's.s:2: .data: initialised data needs XC16\'s startup code: reserve it in .bss and write it in the program',
    's.s:3: .section .const: the program\'s (.text) or the data memory\'s (.bss) only',
    's.s:5: an instruction outside the program\'s section (.text): nop',
    's.s:7: .include "p30F4011.inc": only the PIC24FJ1024GB610\'s names, "p24FJ1024GB610.inc", are built in',
    's.s:8: no directive .frob',
    's.s:10: .space: in .bss (the program\'s words are .word / .pword)',
  ]);
});

test('#5931 a program linked as XC16 links it: the reset vector, the vector table, __DefaultInterrupt, the configuration words', async () => {
  const { assemble, assembleProgram, asmMessage, parseHex, readConfig } = await import('../packages/silinx-pic24/src/index.js');
  const r = assembleProgram(XC16(['    mov #0x0900, w15', 'loop: bra loop', '    .global __T1Interrupt', '__T1Interrupt:', '    bclr IFS0, #T1IF', '    retfie']), { file: 'p.s' });
  assert.deepEqual([r.errors, r.warnings, r.linked], [[], [], true]);
  assert.deepEqual([...r.words.slice(0, 2)], [0x040200, 0x000000]);   // GOTO __reset (0x200)
  assert.equal(r.words[0x1a / 2], 0x000204);   // T1's vector (IRQ 3, 0x14 + 2 x 3): its handler
  assert.equal(r.words[0x14 / 2], 0x000208);   // INT0's: __DefaultInterrupt, a RESET after the program
  assert.equal(r.words[0x04 / 2], 0x000208);   // (a trap's too)
  assert.equal(r.words[0x208 / 2], 0xfe0000);
  const hex = parseHex(r.hex);
  assert.equal(hex.program[0x100], assemble(['mov #0x0900, w15']).words[0]);
  assert.equal(readConfig((a) => (a === 0x0abf20 ? r.config[0x0abf20] : 0xffffff)).watchdog, 'off');
  assert.equal(r.config[0x0abf20], 0xffff9f);
  // its own __DefaultInterrupt; settings ANDed; a handler not .global (XC16 would not see it): said, its vector the default's
  const own = assembleProgram(XC16(['loop: bra loop', '__DefaultInterrupt: reset', '__U1RXInterrupt: retfie', '    config __FOSCSEL, FNOSC_PRI']), { file: 'q.s' });
  assert.deepEqual(own.errors, []);
  assert.deepEqual(own.warnings.map(asmMessage), ['q.s:8: __U1RXInterrupt is not .global: XC16\'s linker would leave its vector to __DefaultInterrupt']);
  assert.equal(own.words[(0x14 + 2 * 11) / 2], 0x000202);
  assert.deepEqual(own.config, { 0x0abf20: 0xffff9f, 0x0abf18: 0xfffffa });
  // the refusals: no __reset defined, a configuration word or setting not the device's, a word set twice
  assert.deepEqual(assembleProgram(['.global __reset', 'nop'], { file: 'r.s' }).errors.map(asmMessage), ['r.s:1: __reset is .global but not defined: the program\'s entry']);
  assert.deepEqual(assembleProgram(['config __FWDTX, FWDTEN_OFF', 'config __FWDT, WINDIS_ON', 'nop'], { file: 'c.s' }).errors.map(asmMessage), [
    'c.s:1: config __FWDTX: no such configuration word (__FSEC, __FBSLIM, __FSIGN, __FOSCSEL, __FOSC, __FWDT, __FPOR, __FICD, __FDEVOPT1, __FBOOT)',
    'c.s:2: config __FWDT: no setting WINDIS_ON (FWDTEN_OFF, FWDTEN_ON_ACTIVE, FWDTEN_SWON, FWDTEN_ON)']);
  const twice = assembleProgram(XC16(['nop', 'config __FWDT, FWDTEN_ON']), { file: 't.s' });
  assert.deepEqual(twice.warnings.map(asmMessage), ['t.s:7: config __FWDT set again (first at line 2)']);
  assert.equal(twice.config[0x0abf20], 0xffff9f, 'the settings ANDed, as XC16\'s');
  // an older source (no __reset): from 0, as it is
  assert.deepEqual([...assembleProgram(['goto main', '.org 0x4', 'main: bra main']).words], [0x040004, 0x000000, 0x37ffff]);
});

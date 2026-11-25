// Test helper (not a test file): the PIC24 node's firmware for the System's tests (#5484), XC16's Intel HEX made by the
// tests' assembler (test/pic24-asm.mjs; compiling C with XC16 is #5482's), the watchdog off in its configuration words,
// the oscillator the erased words' (the FRC divided: Fcy 2 MHz).
//
//   buttonLedHex()   D3 (RA0) lit while S3 (RD6) is pressed; RA1 follows RD13 (S4, or a link); RA2 is RD8's inverse
//   explorerHex()    the LCD's two rows written, then buttonLedHex's loop
//   echoHex()        UART2 on the USB-UART's pins (PPS: U2RX on RP10 RF4, U2TX on RP17 RF5) at 9600 baud: '>' sent,
//                    then each character received sent back
import { writeHex } from '../packages/silinx-pic24/src/index.js';
import { pic24Assemble } from './pic24-asm.mjs';

const FWDT = 0x0abf20, FWDT_OFF = 0xffff9f;
// (the SFRs: TRISA 0x0662, LATA 0x0666, ANSA 0x066a; PORTD 0x06a0, ANSD 0x06a6; UART2's 0x03ae…; RPINR19, RPOR8)
const START = ['goto main', '.org 0x200', 'main: mov #0x0900, w15'];

/** A program's .hex (its source's lines, from address 0): its words, then the configuration word FWDT (the watchdog
 *  off): an example's firmware (examples/uart-pic24/pic/lcd_uart.asm). */
export function asmHex(lines) {
  const { words } = pic24Assemble(lines);
  return writeHex(words).replace(/:00000001FF\n$/, '') + writeHex([FWDT_OFF], FWDT >> 1);
}
/** A program's .hex, its lines after a GOTO to 0x200 and the stack set. */
export const hexOf = (lines) => asmHex([...START, ...lines]);

const BUTTONS = [
  'clr 0x066a', 'clr 0x06a6', 'mov #0xff00, w0', 'mov w0, 0x0662',
  'loop: btsc 0x06a0, #6', 'bra s3up', 'bset 0x0666, #0', 'bra s4',
  's3up: bclr 0x0666, #0',
  's4: btsc 0x06a0, #13', 'bra s4hi', 'bclr 0x0666, #1', 'bra d8',
  's4hi: bset 0x0666, #1',
  'd8: btsc 0x06a0, #8', 'bra d8hi', 'bset 0x0666, #2', 'bra loop',
  'd8hi: bclr 0x0666, #2', 'bra loop',
];
export const buttonLedHex = () => hexOf(BUTTONS);

// the LCD through the EPMP (CS1 at EDS 0x020000: EA 0x8000 with DSxPAG 4 is RS 0, 0x8001 RS 1), its busy flag polled
const PMP_ON = ['mov #0x0200, w0', 'mov w0, 0x0132', 'mov #0x8300, w0', 'mov w0, 0x0128', 'mov #4, w0', 'mov w0, 0x0032', 'mov w0, 0x0034', 'mov #0x8000, w1'];
const SEND = (v, rs) => [`mov #${v}, w0`, 'call busy', `mov.b w0, [w1+${rs}]`];
const text = (t) => [...t].flatMap((c) => SEND(c.charCodeAt(0), 1));
/** The LCD's two rows written (function set, display on, entry mode, clear), then buttonLedHex's loop. */
export const explorerHex = (top = 'Silinx PIC24', bottom = 'Explorer 16/32') => hexOf([
  ...PMP_ON, ...SEND(0x38, 0), ...SEND(0x0c, 0), ...SEND(0x06, 0), ...SEND(0x01, 0), ...text(top), ...SEND(0xc0, 0), ...text(bottom),
  ...BUTTONS,
  'busy: mov.b [w1], w2', 'btsc w2, #7', 'bra busy', 'return',
]);

export const echoHex = () => hexOf([
  'mov #0x3f0a, w0', 'mov w0, 0x07b6', 'mov #0x0500, w0', 'mov w0, 0x07e4',
  'mov #12, w0', 'mov w0, 0x03b6', 'mov #0x8000, w0', 'mov w0, 0x03ae', 'mov #0x1400, w0', 'mov w0, 0x03b0',
  'mov #0x3e, w0', 'mov w0, 0x03b2',
  'loop: btss 0x03b0, #0', 'bra loop', 'mov 0x03b4, w0', 'mov w0, 0x03b2', 'bra loop',
]);

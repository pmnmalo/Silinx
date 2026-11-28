// silinx-pic24 - the PIC24FJ1024GB610's names for the assembler (#5931), as XC16's p24FJ1024GB610.inc gives them to a
// program: its special function registers' addresses (the emulator's own register map, from the data sheet DS30010074:
// the same constants its peripherals use), their bits' numbers, its interrupts' vector names and flag bits, its
// configuration words' settings. Silinx's own (Microchip's .inc is not shipped); checked against XC16's where it is
// (#5937).
import { SFR, CONFIG_WORDS, TRAPS, irqVector } from './device.js';

const range = (prefix, from, to, base, step = 2) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${prefix}${from + i}`, base + step * i]));

// the registers
const ports = Object.fromEntries('ABCDEFG'.split('').flatMap((p, i) => {
  const b = 0x0662 + 0x14 * i;   // (gpio.js: TRISx, PORTx, LATx, ODCx, ANSx)
  return [[`TRIS${p}`, b], [`PORT${p}`, b + 2], [`LAT${p}`, b + 4], [`ODC${p}`, b + 6], [`ANS${p}`, b + 8]];
}));
const uarts = Object.fromEntries([0x0398, 0x03ae, 0x03c4, 0x03d0, 0x03dc, 0x03e8].flatMap((b, i) => {
  const n = i + 1;   // (uart.js)
  return [[`U${n}MODE`, b], [`U${n}STA`, b + 2], [`U${n}TXREG`, b + 4], [`U${n}RXREG`, b + 6], [`U${n}BRG`, b + 8], [`U${n}ADMD`, b + 10]];
}));
const spis = Object.fromEntries([0x03f4, 0x0410, 0x042c].flatMap((b, i) => {
  const n = i + 1;   // (spi.js)
  return [['CON1L', 0], ['CON1H', 2], ['CON2L', 4], ['STATL', 8], ['STATH', 10], ['BUFL', 12], ['BUFH', 14], ['BRGL', 16], ['IMSK1', 20], ['IMSK2', 22]].map(([r, o]) => [`SPI${n}${r}`, b + o]);
}));
const i2cs = Object.fromEntries([0x0494, 0x04a4, 0x04b4].flatMap((b, i) => {
  const n = i + 1;   // (i2c.js)
  return [['RCV', 0], ['TRN', 2], ['BRG', 4], ['CONL', 6], ['CONH', 8], ['STAT', 10], ['ADD', 12], ['MSK', 14]].map(([r, o]) => [`I2C${n}${r}`, b + o]);
}));
/** The special function registers' data addresses. */
export const REGISTERS = {
  ...Object.fromEntries(Object.entries(SFR).filter(([k]) => k !== 'WREG0')),
  ...range('WREG', 0, 15, 0x0000),
  ...range('IFS', 0, 7, SFR.IFS0), ...range('IEC', 0, 7, SFR.IEC0), ...range('IPC', 0, 29, SFR.IPC0),
  RCON: 0x0110, OSCCON: 0x0100, CLKDIV: 0x0102, OSCTUN: 0x0106, DCOCON: 0x010a, OSCDIV: 0x010c, OSCFDIV: 0x010e,
  TMR1: 0x0190, PR1: 0x0192, T1CON: 0x0194,
  TMR2: 0x0196, TMR3HLD: 0x0198, TMR3: 0x019a, PR2: 0x019c, PR3: 0x019e, T2CON: 0x01a0, T3CON: 0x01a2,
  TMR4: 0x01a4, TMR5HLD: 0x01a6, TMR5: 0x01a8, PR4: 0x01aa, PR5: 0x01ac, T4CON: 0x01ae, T5CON: 0x01b0,
  PMCON1: 0x0128, PMCON2: 0x012a, PMCON3: 0x012c, PMCON4: 0x012e, PMCS1CF: 0x0130, PMCS1BS: 0x0132, PMCS1MD: 0x0134,
  PMCS2CF: 0x0136, PMCS2BS: 0x0138, PMCS2MD: 0x013a, PMDOUT1: 0x013c, PMDOUT2: 0x013e, PMDIN1: 0x0140, PMDIN2: 0x0142, PMSTAT: 0x0144,
  PADCON: 0x065e, IOCSTAT: 0x0660,
  ...ports, ...uarts, ...spis, ...i2cs,
  ...range('ADC1BUF', 0, 25, 0x0712),
  AD1CON1: 0x0746, AD1CON2: 0x0748, AD1CON3: 0x074a, AD1CHS: 0x074c, AD1CSSH: 0x074e, AD1CSSL: 0x0750, AD1CON4: 0x0752, AD1CON5: 0x0754,
  ...range('RPINR', 0, 37, 0x0790), ...range('RPOR', 0, 15, 0x07d4),
};

// the interrupts (table 8-2): IRQ number -> its vector's name (XC16's _<name>Interrupt) and its flag bits' (<name>IF, IE)
const IRQ = [
  [0, 'INT0'], [1, 'IC1'], [2, 'OC1'], [3, 'T1'], [5, 'IC2'], [6, 'OC2'], [7, 'T2'], [8, 'T3'], [9, 'SPI1'], [10, 'SPI1TX'],
  [11, 'U1RX'], [12, 'U1TX'], [13, 'AD1'], [16, 'SI2C1'], [17, 'MI2C1'], [19, 'IOC'], [20, 'INT1'], [27, 'T4'], [28, 'T5'],
  [29, 'INT2'], [30, 'U2RX'], [31, 'U2TX'], [32, 'SPI2'], [33, 'SPI2TX'], [45, 'PMP'], [50, 'MI2C2'], [53, 'INT3'], [54, 'INT4'],
  [58, 'SPI1RX'], [59, 'SPI2RX'], [60, 'SPI3RX'], [65, 'U1ER'], [66, 'U2ER'], [71, 'MI2C3'], [81, 'U3ER'], [82, 'U3RX'], [83, 'U3TX'],
  [87, 'U4ER'], [88, 'U4RX'], [89, 'U4TX'], [90, 'SPI3'], [91, 'SPI3TX'], [111, 'U5RX'], [112, 'U5TX'], [113, 'U5ER'], [114, 'U6RX'],
  [115, 'U6TX'], [116, 'U6ER'],
];
const VECTOR_NAME = { AD1: 'ADC1', U1ER: 'U1Err', U2ER: 'U2Err', U3ER: 'U3Err', U4ER: 'U4Err', U5ER: 'U5Err', U6ER: 'U6Err' };
/** The vectors a program names (its handlers' labels, XC16's): __<name>Interrupt (and the traps') -> program address. */
export const VECTORS = {
  ...Object.fromEntries(IRQ.map(([n, name]) => [`__${VECTOR_NAME[name] || name}Interrupt`, irqVector(n)])),
  __OscillatorFail: TRAPS[0].vector, __AddressError: TRAPS[1].vector, __HardTrapError: TRAPS[2].vector,
  __StackError: TRAPS[3].vector, __MathError: TRAPS[4].vector, __SoftTrapError: TRAPS[6].vector,
};

// the bits (a bit's number in its register, as bset / bclr / btss take it)
const flags = Object.fromEntries(IRQ.flatMap(([n, name]) => [[`${name}IF`, n % 16], [`${name}IE`, n % 16]]));
/** The registers' bits' numbers (TON, UTXEN, T1IF…; a name the registers share has one number: theirs). */
export const BITS = {
  C: 0, Z: 1, OV: 2, N: 3, RA: 4, DC: 8, IPL0: 5, IPL1: 6, IPL2: 7, IPL3: 3, PSV: 2,   // (SR, CORCON)
  NSTDIS: 15, MATHERR: 4, ADDRERR: 3, STKERR: 2, OSCFAIL: 1, GIE: 15, DISI: 14, SWTRAP: 13,   // (INTCON1, INTCON2)
  TON: 15, TSIDL: 13, TGATE: 6, TCKPS0: 4, TCKPS1: 5, T32: 3, TSYNC: 2, TCS: 1,   // (TxCON)
  UARTEN: 15, USIDL: 13, IREN: 12, RTSMD: 11, UEN0: 8, UEN1: 9, WAKE: 7, LPBACK: 6, ABAUD: 5, URXINV: 4, BRGH: 3, PDSEL0: 1, PDSEL1: 2, STSEL: 0,   // (UxMODE)
  UTXISEL1: 15, UTXINV: 14, UTXISEL0: 13, UTXBRK: 11, UTXEN: 10, UTXBF: 9, TRMT: 8, URXISEL0: 6, URXISEL1: 7, ADDEN: 5, RIDLE: 4, PERR: 3, FERR: 2, OERR: 1, URXDA: 0,   // (UxSTA)
  SPIEN: 15, MSTEN: 5, CKP: 6, CKE: 8, SMP: 9, MODE16: 10, MODE32: 11, SPIRBF: 0, SPITBF: 1, SPITBE: 3, SPIRBE: 5, SPIROV: 6, SPIBUSY: 11,   // (SPIxCON1L, SPIxSTATL)
  I2CEN: 15, SEN: 0, RSEN: 1, PEN: 2, RCEN: 3, ACKEN: 4, ACKDT: 5, ACKSTAT: 15, TRSTAT: 14, RBF: 1, TBF: 0,   // (I2CxCONL, I2CxSTAT)
  ADON: 15, MODE12: 10, ASAM: 2, SAMP: 1, DONE: 0,   // (AD1CON1)
  ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [[`RA${i}`, i], [`RB${i}`, i], [`RC${i}`, i], [`RD${i}`, i], [`RE${i}`, i], [`RF${i}`, i], [`RG${i}`, i]]).flat()),
  ...flags,
};

// the names XC16's .inc also gives a register's bit field of the register's own name, [the field's position, the
// register's address] (XC16 2.10's symbols for a program that includes p24FJ1024GB610.inc, #6025)
const spiFields = Object.fromEntries([[1, 0x03f4], [2, 0x0410], [3, 0x042c]].flatMap(([n, b]) =>
  [['BUFL', 12], ['BUFH', 14], ['BRGL', 16], ['URDTL', 24], ['URDTH', 26]].map(([r, o]) => [`SPI${n}${r}`, [0, b + o]])));
/** The names that XC16's p24FJ1024GB610.inc defines as a register's bit field (its position, a constant of the program
 *  that includes it) as well as the register: xc16-as reads the constant, so `mov w0, DSRPAG` writes W0 (f 0); the
 *  register is _DSRPAG, the linker script's (#6025). name -> [the constant, the register's address]. */
export const FIELD_NAMES = {
  DSRPAG: [0, 0x0032], DSWPAG: [0, 0x0034], DISICNT: [0, 0x0052], TBLPAG: [0, 0x0054], DCOTUN: [0, 0x0108], ...spiFields,
  IOCPDF: [3, 0x06d8], AD1DMBUF: [0, 0x075e], AD1RESDMA: [0, 0x075e], NVMADR: [1, 0x0762], NVMADRL: [1, 0x0762], NVMADRH: [0, 0x0764], NVMADRU: [0, 0x0764],
};

/** The configuration words' settings (the `config __FWDT, FWDTEN_OFF` directive's): word -> setting -> its value, the
 *  other bits ones (an erased word's), ANDed together. FWDT's FWDTEN (bits 5-6), FOSCSEL's FNOSC (bits 0-2) and FICD's
 *  JTAGEN (bit 5, #6027), as config.js reads them. */
export const CONFIG_SETTINGS = {
  FWDT: { FWDTEN_OFF: 0xff9f, FWDTEN_ON_ACTIVE: 0xffbf, FWDTEN_SWON: 0xffdf, FWDTEN_ON: 0xffff },
  FOSCSEL: { FNOSC_FRC: 0xfff8, FNOSC_FRCPLL: 0xfff9, FNOSC_PRI: 0xfffa, FNOSC_PRIPLL: 0xfffb, FNOSC_SOSC: 0xfffc, FNOSC_LPRC: 0xfffd, FNOSC_DCO: 0xfffe, FNOSC_FRCDIV: 0xffff },
  FICD: { JTAGEN_OFF: 0xffdf, JTAGEN_ON: 0xffff },
};
/** The configuration words' program addresses, by their names as `config` takes them (__FWDT). */
export const CONFIG_ADDRESSES = Object.fromEntries(Object.entries(CONFIG_WORDS).map(([k, v]) => [`__${k}`, v]));

/** The linker's places (XC16's p24FJ1024GB610.gld): the code's start, after the vector table, and the stack's. */
export const LINK = { CODE_BASE: 0x000200, DATA_BASE: 0x0800, DATA_END: 0x87ff };

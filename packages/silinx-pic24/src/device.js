// silinx-pic24 - the PIC24FJ1024GB610's memory map (#5480): its program memory, its data memory and the CPU's
// special function registers, its configuration words, its vectors. From the family's data sheet (DS30010074,
// section 4 "Memory Organization", section 8 "Interrupt Controller", section 30 "Special Features").

// the program memory: the user flash, 0x000000 to 0x0ABFFE (352K instruction words, the last page's end holding
// the configuration words); the configuration space from 0x800000 (FBOOT), the device's ID at 0xFF0000
export const FLASH_END = 0x0abffe;
export const FLASH_WORDS = (FLASH_END >> 1) + 1;
export const ERASED = 0xffffff;
export const CONFIG_BASE = 0x800000;
export const DEVID_ADDR = 0xff0000;
export const DEVID = 0x601d;   // (FAMID 0x60, DEV 0x1D: the PIC24FJ1024GB610, table 30-4)

// the configuration words (in the user flash's last page, table 4-3), each a program word's low 16 bits
export const CONFIG_WORDS = {
  FSEC: 0x0abf00, FBSLIM: 0x0abf10, FSIGN: 0x0abf14, FOSCSEL: 0x0abf18, FOSC: 0x0abf1c, FWDT: 0x0abf20,
  FPOR: 0x0abf24, FICD: 0x0abf28, FDEVOPT1: 0x0abf2c, FBOOT: 0x801800,
};

// the data memory: the SFRs from 0x0000 to 0x07FF, the RAM from 0x0800 to 0x87FF (32 Kbytes; above 0x7FFF through
// the EDS window, page 1)
export const SFR_END = 0x07ff;
export const RAM_START = 0x0800;
export const RAM_END = 0x87ff;
export const DATA_BYTES = RAM_END + 1;

// the CPU's registers in the SFR space (table 4-4)
export const SFR = {
  WREG0: 0x0000, SPLIM: 0x0020, PCL: 0x002e, PCH: 0x0030, DSRPAG: 0x0032, DSWPAG: 0x0034, RCOUNT: 0x0036,
  SR: 0x0042, CORCON: 0x0044, DISICNT: 0x0052, TBLPAG: 0x0054,
  INTCON1: 0x0080, INTCON2: 0x0082, INTCON4: 0x0086, IFS0: 0x0088, IEC0: 0x0098, IPC0: 0x00a8, INTTREG: 0x00e4,
};

// the SR's bits (register 3-1) and CORCON's (register 3-2)
export const C = 0x0001, Z = 0x0002, OV = 0x0004, N = 0x0008, RA = 0x0010, DC = 0x0100;
export const IPL_SHIFT = 5, IPL_MASK = 0x00e0;
export const IPL3 = 0x0008, PSV = 0x0004;
// INTCON1's (register 8-3) and INTCON2's (register 8-4)
export const NSTDIS = 0x8000, MATHERR = 0x0010, ADDRERR = 0x0008, STKERR = 0x0004, OSCFAIL = 0x0002;
export const GIE = 0x8000, DISI_BIT = 0x4000, SWTRAP = 0x2000;

// the traps (table 8-1): their vectors, from 0x000004, and their fixed priorities (8 to 15, above every interrupt)
export const TRAPS = [
  { name: 'oscillator failure', vector: 0x000004, priority: 14, flag: OSCFAIL },
  { name: 'address error', vector: 0x000006, priority: 13, flag: ADDRERR },
  { name: 'general hardware error', vector: 0x000008, priority: 13, flag: 0 },
  { name: 'stack error', vector: 0x00000a, priority: 12, flag: STKERR },
  { name: 'math error', vector: 0x00000c, priority: 11, flag: MATHERR },
  null,
  { name: 'general software error', vector: 0x000010, priority: 9, flag: 0 },
];
export const TRAP = { OSCFAIL: 0, ADDRERR: 1, HARD: 2, STKERR: 3, MATHERR: 4, SOFT: 6 };

// the interrupts (table 8-2): IRQ n's vector at 0x000014 + 2n, its flag IFSx[n % 16], its enable IECx, its priority
// IPCx's 3 bits at (n % 4) * 4
export const IRQS = 118;
export const IVT_BASE = 0x000014;
export const irqVector = (n) => IVT_BASE + 2 * n;

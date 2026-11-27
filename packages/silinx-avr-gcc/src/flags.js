// @silinx/avr-gcc - the commands gcc's driver would run (#5934): avr-gcc 7.3.0's, as `avr-gcc -###` writes them for the
// Arduino AVR core's recipes (its platform.txt, 1.8.8) on the ATmega328P, LTO left out (no linker plugin in WebAssembly).
// The paths are the tools' virtual file system's: the sysroot at /sysroot, the Arduino core at /arduino, the build in /w.

/** The Arduino AVR core's version (its headers and archives in the package's arduino/). */
export const ARDUINO_CORE = '1.8.8';
/** The boards: their -D defines and variant, their upload's most bytes and their RAM (the core's boards.txt; the Nano's
 *  ATmega328 one, its old bootloader's). */
export const BOARDS = {
  'arduino-uno': { define: 'ARDUINO_AVR_UNO', variant: 'standard', flash: 32256, ram: 2048 },
  'arduino-nano': { define: 'ARDUINO_AVR_NANO', variant: 'eightanaloginputs', flash: 30720, ram: 2048 },
};
const MCU = ['-D__AVR_ATmega328P__', '-D__AVR_DEVICE_NAME__=atmega328p'];
const DEFINES = (board, fcpu) => ['-DF_CPU=' + fcpu, '-DARDUINO=10607', `-D${BOARDS[board].define}`, '-DARDUINO_ARCH_AVR'];
/** The include folders: the core's, its variant's, the libraries' (Wire, SPI), then the system's. */
const includes = (board) => ['-nostdinc', '-I', '/arduino/core', '-I', `/arduino/variants/${BOARDS[board].variant}`,
  '-I', '/arduino/libraries/Wire/src', '-I', '/arduino/libraries/Wire/src/utility', '-I', '/arduino/libraries/SPI/src',
  '-isystem', '/sysroot/gcc/include', '-isystem', '/sysroot/gcc/include-fixed', '-isystem', '/sysroot/avr/include', '-imultilib', 'avr5'];
const TARGET = ['-mn-flash=1', '-mno-skip-bug', '-mmcu=avr5'];

/**
 * A source's compile: [{ tool, args }] (cc1 / cc1plus to its assembly, then as; a .S preprocessed by cc1, then as).
 * `src` its path in /w, `obj` its object's; board, fcpu as the build's; extra: more flags for the compiler (-Dname).
 */
export function compileSteps(src, obj, { board = 'arduino-uno', fcpu = '16000000L', extra = [] } = {}) {
  const s = obj.replace(/\.o$/, '.s'), base = src.split('/').pop(), inc = includes(board), defs = [...MCU, ...DEFINES(board, fcpu), ...extra];
  const as = { tool: 'as', args: ['-mmcu=avr5', '-mno-skip-bug', '-o', obj, s] };
  if (/\.S$/.test(src)) return [{ tool: 'cc1', args: ['-E', '-lang-asm', '-quiet', ...inc, ...defs, src, ...TARGET, '-fno-directives-only', '-o', s] }, as];
  if (/\.c$/.test(src)) {
    return [{ tool: 'cc1', args: ['-quiet', ...inc, ...defs, src, ...TARGET, '-quiet', '-dumpbase', base, '-auxbase-strip', obj, '-Os', '-std=gnu11', '-ffunction-sections', '-fdata-sections', '-o', s] }, as];
  }
  return [{ tool: 'cc1plus', args: ['-quiet', ...inc, ...defs, src, ...TARGET, '-quiet', '-dumpbase', base, '-auxbase-strip', obj, '-Os', '-Wno-error=narrowing', '-std=gnu++11',
    '-fpermissive', '-fno-exceptions', '-ffunction-sections', '-fdata-sections', '-fno-threadsafe-statics', '-fno-rtti', '-fno-enforce-eh-specs', '-o', s] }, as];
}

/** The link (collect2's ld, the ATmega328P's startup and libraries) and the .hex (objcopy): [{ tool, args }]. */
export const linkSteps = (objs, archives, elf = 'sketch.elf', hex = 'sketch.hex') => [
  { tool: 'ld', args: ['-mavr5', '-T', '/sysroot/ldscripts/avr5.x', '-Tdata', '0x800100', '-o', elf, '/sysroot/avr/lib/crtatmega328p.o', '-L/sysroot/gcc/lib',
    '-L/sysroot/avr/lib', '--gc-sections', ...objs, ...archives, '-lm', '--start-group', '-lgcc', '-lm', '-lc', '-latmega328p', '--end-group'] },
  { tool: 'objcopy', args: ['-O', 'ihex', '-R', '.eeprom', elf, hex] },
];

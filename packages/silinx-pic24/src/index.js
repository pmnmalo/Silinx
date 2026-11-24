// silinx-pic24's public API (#5480): the PIC24F core of the PIC24FJ1024GB610, isomorphic (Node and the browser), with
// no dependency. A name not exported here is the package's own and may change in any version.

export { CPU } from './cpu.js';
export { irqPriority, irqFlag, irqEnabled, setIrqFlag, ENTRY_CYCLES } from './interrupts.js';
export * as device from './device.js';

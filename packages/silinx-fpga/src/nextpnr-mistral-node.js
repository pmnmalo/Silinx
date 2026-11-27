// Silinx toolchain - nextpnr-mistral in Node (#5377): io.nextpnr.cyclone5 for the Cyclone V's back end, from Silinx's package
// (@silinx/nextpnr-mistral, an optional dependency: Mistral's routing data of the e50f and the sx120f), loaded on its first use.
import { mistralIo } from './nextpnr-mistral-io.js';

/** io.nextpnr.cyclone5 in this process: { run(args, files, onLine) -> files, data(model) -> { '<die>-r.bin': bytes } }. */
export const nextpnrMistralNode = () => mistralIo(async () => {
  try {
    return await import('@silinx/nextpnr-mistral');
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    throw new Error('nextpnr-mistral is not installed: npm install @silinx/nextpnr-mistral');
  }
});

// Silinx toolchain - nextpnr-himbaechel-gatemate and gmpack in Node (#2431): io.nextpnr.gatemate for the GateMate's back end, from
// YoWASP's package (@yowasp/nextpnr-himbaechel-gatemate, an optional dependency: about 35 MB, the CCGM1A1's and CCGM1A2's chip
// databases), loaded on its first use.
import { gatemateIo } from './nextpnr-gatemate-io.js';

/** io.nextpnr.gatemate in this process: { run(args, files, onLine) -> files, pack(config) -> Uint8Array }. */
export const nextpnrGatemateNode = () => gatemateIo(async () => {
  try {
    return await import('@yowasp/nextpnr-himbaechel-gatemate');
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    throw new Error('nextpnr-himbaechel-gatemate is not installed: npm install @yowasp/nextpnr-himbaechel-gatemate');
  }
});

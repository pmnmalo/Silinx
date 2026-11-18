// Silinx toolchain - io.nextpnr.gatemate of the GateMate's back end (#2431, open-flow-gatemate.js) from YoWASP's WebAssembly
// package of nextpnr-himbaechel with Project Peppercorn's chip databases and tools (@yowasp/nextpnr-himbaechel-gatemate):
// nextpnr's run as the other micro-architectures' (nextpnr-io.js), and gmpack's. In Node (nextpnr-gatemate-node.js) and in the
// browser's flow worker, each loading the package its own way.
import { nextpnrIo } from './nextpnr-io.js';

/** io.nextpnr.gatemate: { run(args, files, onLine) -> files, pack(config) -> Uint8Array }; load() resolves the package's module. */
export function gatemateIo(load) {
  let pkg = null;
  const mod = async () => (pkg ||= await load());
  const { run } = nextpnrIo(mod, 'runNextpnrHimbaechelGatemate');
  return {
    run,
    async pack(config) {
      const { runGmpack, Exit } = await mod();
      const lines = [];
      const out = bytes => { if (bytes) lines.push(new TextDecoder().decode(bytes)); };
      try {
        const files = await runGmpack(['routed.cfg', 'design.bit'], { 'routed.cfg': config }, { stdout: out, stderr: out, decodeASCII: false, fetchProgress: () => {} });
        return files['design.bit'];
      } catch (e) {
        if (e instanceof Exit) throw new Error(`gmpack exited with code ${e.code}: ${lines.join('').trim()}`);
        if (typeof e?.message === 'string') throw e;
        throw new Error(`gmpack stopped on an error${lines.length ? `: ${lines.join('').trim()}` : ''}`, { cause: e });
      }
    },
  };
}

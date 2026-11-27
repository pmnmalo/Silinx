// Silinx toolchain - io.nextpnr.cyclone5 of the Cyclone V's back end (#5377, open-flow-mistral.js) from Silinx's WebAssembly
// package of nextpnr-mistral (@silinx/nextpnr-mistral, built in nextpnr-spartan's CI): nextpnr's run as the other
// micro-architectures' (nextpnr-io.js), and the routing data of a model's die, the file nextpnr reads in its working directory
// (data/<die>-r.bin: the package's own data(model), or file(name) where the package came as a tarball, kept beside it, as the
// Gowin's database is read). In Node (nextpnr-mistral-node.js, server/open-flow-run.js) and in the browser's flow worker.
import { nextpnrIo } from './nextpnr-io.js';

/** io.nextpnr.cyclone5: { run(args, files, onLine) -> files, data(model) -> { '<die>-r.bin': bytes } }; load() resolves the
 *  package's module, file(name) a file of the package (bytes, or null) when given. */
export function mistralIo(load, file = null) {
  let pkg = null;
  const mod = async () => (pkg ||= await load());
  const { run } = nextpnrIo(mod, 'runNextpnrMistral');
  return {
    run,
    async data(model) {
      const m = await mod();
      if (!file) return m.data(model);
      const name = `${m.dieOf(model)}-r.bin`, bytes = await file(`data/${name}`);
      if (!bytes) throw new Error(`data/${name} is not in @silinx/nextpnr-mistral`);
      return { [name]: bytes };
    },
  };
}

// The Mistral commit @silinx/nextpnr-mistral is built from (MISTRAL_REF of nextpnr-spartan's mistral.yml, its branch silinx),
// followed by the monthly Pins workflow (scripts/check-pins.mjs, #5649) against Mistral's head; the WASI SDK and xz the build
// takes are pinned in the fork's mistral/ci/build-wasm.sh
export const PINNED = [{ kind: 'commit', name: 'Mistral, the Cyclone V\'s database of @silinx/nextpnr-mistral (nextpnr-spartan\'s MISTRAL_REF)', repo: 'Ravenslofty/mistral',
  remote: { url: 'https://raw.githubusercontent.com/pmnmalo/nextpnr-spartan/silinx/.github/workflows/mistral.yml', match: '^  MISTRAL_REF: ([0-9a-f]{40})' },
  update: 'MISTRAL_REF in the fork\'s .github/workflows/mistral.yml, a new release of its package (mistral-vX.Y.Z), then a "nextpnr update" pull request here' }];

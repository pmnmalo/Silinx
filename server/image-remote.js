// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A compiler's Docker image on the ISE machine (XC16's, #5482; arm-none-eabi-gcc's, #4687), reached over ssh as ISE's
// image is (server/ise.js: ssh.host, its build folder under ssh.remoteDir): the local build folder uploaded (tar over
// ssh), its build.sh run in the image (no network, the folder at /work), its out/ brought back, the remote folder removed.
import { runCommand } from './jobs.js';
import { DOCKER_ISOLATION, remoteDirFor, runPipe, shQuote, sshParts } from './ise.js';

/**
 * The build folder `root` built by its build.sh in `image` on the ISE machine (config `cfg`), in its remote folder
 * `remote` (a name of ssh.remoteDir's: `<project>.<node>.<tool>`); `who` names the program and `tool` its compiler in its errors, said through
 * `said`; the image's output through `onLine`. Its exit code: the build's, or the transfer's when it failed.
 */
export async function runInImage(quiet, cfg, { remote, root, image, who, tool }, onLine, said) {
  const { target, opts } = sshParts(cfg);
  const rq = shQuote(remoteDirFor(cfg, remote));
  let code = await runPipe(quiet, ['tar', ['-C', root, '-cf', '-', '.']], ['ssh', [...opts, '--', target, `rm -rf ${rq} && mkdir -p ${rq} && tar -C ${rq} -xf -`]]);
  if (code !== 0) { said(`ERROR: ${who}: its sources could not be sent to the ISE machine (exit code ${code})`); return code; }
  // (a non-interactive ssh shell may lack Docker Desktop's /usr/local/bin, macOS's, on its PATH: ISE's way)
  const run = `export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"; cd ${rq} && docker run --rm --pull=never ${DOCKER_ISOLATION.join(' ')} -v "$PWD":/work -w /work ${shQuote(image)} bash build.sh`;
  const flow = await runCommand(quiet, 'ssh', [...opts, '--', target, run], { echo: false, onLine });
  code = await runPipe(quiet, ['ssh', [...opts, '--', target, `tar -C ${rq} -cf - out`]], ['tar', ['-C', root, '-xf', '-']]);
  await runCommand(quiet, 'ssh', [...opts, '--', target, `rm -rf ${rq}`], { echo: false }).catch(() => {});
  if (code !== 0 && flow === 0) { said(`ERROR: ${who}: ${tool} ran on the ISE machine, but its results could not be brought back (exit code ${code})`); return code; }
  return flow;
}

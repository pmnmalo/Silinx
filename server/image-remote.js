// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A compiler's Docker image on the ISE machine (XC16's, #5482; arm-none-eabi-gcc's, #4687), reached over ssh as ISE's
// image is (server/ise.js: ssh.host, its build folder under ssh.remoteDir): the local build folder uploaded (tar over
// ssh), its build.sh run in the image (no network, the folder at /work), its out/ brought back, the remote folder removed.
// Or the image in this computer's Docker (config.json's xc16.mode or armGcc.mode 'docker': the ISE runner's own images,
// #6019): the build folder itself at /work.
import { capture, runCommand } from './jobs.js';
import { which } from './toolchain.js';
import { DOCKER_ISOLATION, remoteDirFor, runPipe, shQuote, sshParts } from './ise.js';

// (where Docker Desktop and Homebrew put docker, besides the PATH: a server started from the Dock has a short PATH)
const DOCKER_DIRS = ['/usr/local/bin', '/opt/homebrew/bin'];

/** Docker on this computer and `image` in it (never pulled): { available, docker (its path), reason }. */
export async function localImage(image) {
  const docker = which('docker') || which('docker', DOCKER_DIRS);
  if (!docker) return { available: false, docker: null, reason: 'docker not found on this computer' };
  const r = await capture(docker, ['image', 'inspect', '--format', '{{.Id}}', image], { timeoutMs: 20000 });
  if (r.code === 0) return { available: true, docker, reason: `the image ${image} in this computer's Docker` };
  if (/No such image/i.test(r.out)) return { available: false, docker, reason: `the image ${image} is not in this computer's Docker` };
  return { available: false, docker, reason: `this computer's Docker did not answer (docker image inspect: ${r.error || `exit code ${r.code}`})` };
}

/** The build folder `root` built by its build.sh in `image` in this computer's Docker (`docker`: localImage's), the
 *  folder at /work, no network; the image's output through `onLine`. Its exit code. */
export function runInLocalImage(quiet, { root, image, docker }, onLine) {
  const args = ['run', '--rm', '--pull=never', ...DOCKER_ISOLATION, '-v', `${root}:/work`, '-w', '/work'];
  // (Linux: the calling user's, so that out/ is not root's; Docker Desktop maps the owner by itself, as ISE's image's)
  if (process.platform === 'linux' && typeof process.getuid === 'function') args.push('--user', `${process.getuid()}:${process.getgid()}`);
  return runCommand(quiet, docker, [...args, image, 'bash', 'build.sh'], { echo: false, onLine });
}

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

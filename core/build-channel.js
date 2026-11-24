// The build's channel (#5202): 'dev' (the development build: the site's dev/, a checkout's local server) or 'release',
// as server/build-commit.js tells them apart (a commit tagged v<VERSION>, or no git: a release). The single-file
// edition's is its BUILD's (core/version.js); the local server and the MCP server set theirs (server/build-channel.js),
// and the local server's page reads it from web/build-channel.js, the script the server writes. A feature that is not
// in a release yet is switched here, one constant each. Isomorphic module (browser + Node).
import { BUILD } from './version.js';

/** Systems (roadmap #4695) in a release: false until it is stable; true turns it on in every build. */
export const SYSTEMS_IN_RELEASE = false;

let channel = globalThis.SILINX_CHANNEL === 'dev' || globalThis.SILINX_CHANNEL === 'release' ? globalThis.SILINX_CHANNEL : (BUILD ? 'dev' : 'release');
/** The build's channel: 'dev' or 'release'. */
export const buildChannel = () => channel;
/** The channel set (the local server's and the MCP server's, at their start; the tests'). */
export function setBuildChannel(c) {
  if (c !== 'dev' && c !== 'release') throw new Error(`no build channel '${c}' (dev, release)`);
  channel = c;
}
/** The build's channel the environment asks for (#5202, core/build-channel.js), or null (the build's own):
 *  SILINX_CHANNEL (dev, release); under node --test (NODE_TEST_CONTEXT), 'dev': the tests run the features a release has
 *  not yet, at a release's tag too (its CI), and ask for SILINX_CHANNEL=release to test a release. */
export function channelFromEnv(env = globalThis.process?.env ?? {}) {
  if (env.SILINX_CHANNEL === 'dev' || env.SILINX_CHANNEL === 'release') return env.SILINX_CHANNEL;
  return env.NODE_TEST_CONTEXT ? 'dev' : null;
}
/** Whether Systems are on in this build. */
export const systemsOn = () => SYSTEMS_IN_RELEASE || channel === 'dev';
/** Why a System is refused in this build (the interface's, the stores' and the MCP server's message). */
export const SYSTEMS_OFF = 'Systems are not in this release yet: it is in the development build (the site\'s dev/) until it is stable.';

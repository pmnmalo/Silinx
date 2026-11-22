// The build's channel (#5202): 'dev' (the development build: the site's dev/, a checkout's local server) or 'release',
// as scripts/build-info.mjs tells them apart (a commit tagged v<VERSION>, or no git: a release). The single-file
// edition's is its BUILD's (core/version.js); the local server and the MCP server set theirs (server/build-channel.js),
// and the local server's page reads it from web/build-channel.js, the script the server writes. A feature that is not
// in a release yet is switched here, one constant each. Isomorphic module (browser + Node).
import { BUILD } from './version.js';

/** Co-design (roadmap #4695) in a release: false until it is stable; true turns it on in every build. */
export const CODESIGN_IN_RELEASE = false;

let channel = globalThis.SILINX_CHANNEL === 'dev' || globalThis.SILINX_CHANNEL === 'release' ? globalThis.SILINX_CHANNEL : (BUILD ? 'dev' : 'release');
/** The build's channel: 'dev' or 'release'. */
export const buildChannel = () => channel;
/** The channel set (the local server's and the MCP server's, at their start; the tests'). */
export function setBuildChannel(c) {
  if (c !== 'dev' && c !== 'release') throw new Error(`no build channel '${c}' (dev, release)`);
  channel = c;
}
/** Whether co-design is on in this build. */
export const codesignOn = () => CODESIGN_IN_RELEASE || channel === 'dev';
/** Why co-design is refused in this build (the interface's, the stores' and the MCP server's message). */
export const CODESIGN_OFF = 'Co-design is not in this release yet: it is in the development build (the site\'s dev/) until it is stable.';

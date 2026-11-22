// The local server's and the MCP server's build channel (#5202, core/build-channel.js): a checkout at a commit that is
// not the release's tag is the development build's ('dev'); a release's (its zip, no git; the tagged commit) 'release',
// as scripts/build-info.mjs says for the single-file edition. SILINX_CHANNEL (dev, release) sets it instead, and the
// tests run in 'dev' (core/build-channel.js channelFromEnv).
// Set when this module is imported (server/projects.js imports it, so every server does).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../core/version.js';
import { setBuildChannel, buildChannel, channelFromEnv } from '../core/build-channel.js';
import { buildInfo } from './build-commit.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
setBuildChannel(channelFromEnv() ?? (buildInfo(ROOT, VERSION, {}) ? 'dev' : 'release'));

/** The page's script of the channel (web/build-channel.js, as the server serves it). */
export const channelScript = () => `globalThis.SILINX_CHANNEL = ${JSON.stringify(buildChannel())};\n`;

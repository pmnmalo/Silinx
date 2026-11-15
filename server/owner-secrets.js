// What a shared project's owner's computer is named by in what its followers get (#4002, core/collab-runs.js): the
// lines of a run, the reports, the Design Summary. The pairs [secret, placeholder] the page (GET /api/toolchain's
// `redact`) and the MCP's run_process (server/mcp-collab.js sharedRun) replace: the workspace and the exchange folder
// (as given and as the system resolves them), Silinx's configuration folder, the home folder (the user's name), and the
// ISE machine the build reaches over SSH (its user@host, its host, SILINX_ISE_HOST, an absolute build folder there).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workspaceDir } from './projects.js';
import { configDir, loadConfig } from './toolchain.js';

// a folder as given and as the system names it (its links followed, a short name expanded)
const spellings = dir => {
  const real = f => { try { return f(dir); } catch { return dir; } };
  return [...new Set([path.resolve(dir), real(fs.realpathSync), real(fs.realpathSync.native)])];
};

/** [[secret, placeholder]], the longest secret first (a folder inside another replaced as itself). */
export async function ownerSecrets({ env = process.env, home = os.homedir() } = {}) {
  const out = [];
  const exchange = path.resolve(env.SILINX_MCP_FOLDER || path.join(home, 'Downloads'));
  for (const [dir, label] of [[workspaceDir(), '<workspace>'], [exchange, '<exchange folder>'], [configDir(), '<Silinx configuration>'], [home, '~']]) {
    for (const d of spellings(dir)) out.push([d, label]);
  }
  try {
    const ssh = (await loadConfig()).ssh || {};
    if (ssh.user && ssh.host) out.push([`${ssh.user}@${ssh.host}`, '<ISE host>']);
    if (ssh.host) out.push([String(ssh.host), '<ISE host>']);
    if (path.posix.isAbsolute(String(ssh.remoteDir || ''))) out.push([String(ssh.remoteDir), '<ISE build folder>']);
  } catch { /* no configuration */ }
  const ise = env.SILINX_ISE_HOST;
  if (ise && ise !== 'local') out.push([ise, '<ISE host>'], [ise.replace(/^.*@/, ''), '<ISE host>']);
  const seen = new Set();
  return out.filter(([s]) => typeof s === 'string' && s.length > 2 && s !== path.parse(s).root && !seen.has(s) && seen.add(s))
    .sort((a, b) => b[0].length - a[0].length);
}

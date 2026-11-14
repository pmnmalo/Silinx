// Open in VS Code (#4017): a project's file, or its folder, opened in the user's editor on this computer. The server
// runs the editor's program (found on PATH or where it is installed, spawned without a shell: `code <project folder>
// --goto <file>:<line>`); when it is not found, the page opens the editor's link (vscode://file/<path>:<line>) instead.
// The program is config.json's (`editor`: a known editor, a program's absolute path, or "off"), never the request's;
// the file is one of the project's (its path confined, no hidden file or folder); and only a page on this computer
// asks it (a server reached from another computer would open the editor on the server's screen, not the user's).
// The project's file changed there is told to its pages (server/project-watch.js, #2843).
import fss from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn as spawnChild } from 'node:child_process';
import * as P from './projects.js';
import { loadConfig } from './toolchain.js';
import { DESIGN_ONLY_MESSAGES, hdlSideFile, isDesignOnly } from '../core/project-kind.js';

/** The editors Silinx knows: their label, their link's scheme, their command, where they are installed. */
export const EDITORS = {
  code: { label: 'VS Code', scheme: 'vscode', cli: 'code', app: 'Visual Studio Code.app', win: 'Microsoft VS Code/Code.exe', linux: ['/usr/share/code/bin/code', '/snap/bin/code'] },
  'code-insiders': { label: 'VS Code Insiders', scheme: 'vscode-insiders', cli: 'code-insiders', app: 'Visual Studio Code - Insiders.app', win: 'Microsoft VS Code Insiders/Code - Insiders.exe', linux: ['/usr/share/code-insiders/bin/code-insiders', '/snap/bin/code-insiders'] },
  codium: { label: 'VSCodium', scheme: 'vscodium', cli: 'codium', app: 'VSCodium.app', win: 'VSCodium/VSCodium.exe', linux: ['/usr/share/codium/bin/codium', '/snap/bin/codium'] },
  cursor: { label: 'Cursor', scheme: 'cursor', cli: 'cursor', app: 'Cursor.app', win: 'cursor/Cursor.exe', linux: ['/usr/share/cursor/bin/cursor'] },
};
export const DEFAULT_EDITOR = 'code';

/** config.json's `editor` read: { off } when turned off ("off", false, or SILINX_EDITOR=off); { id, ...EDITORS[id] } for a
 *  known editor; { program, label } for a program's absolute path (a VS Code-like command line); an unknown value, the
 *  default's, with its error. */
export function editorSetting(value, env = process.env) {
  if (/^(off|0|false|no)$/i.test(String(env.SILINX_EDITOR || '')) || value === false || value === 'off') return { off: true };
  const v = value == null || value === '' ? DEFAULT_EDITOR : value;
  if (typeof v === 'string' && Object.hasOwn(EDITORS, v)) return { id: v, ...EDITORS[v] };
  if (typeof v === 'string' && path.isAbsolute(v)) return { program: v, label: path.basename(v).replace(/\.(exe|cmd|bat|sh)$/i, '') };
  return { id: DEFAULT_EDITOR, ...EDITORS[DEFAULT_EDITOR], error: `config.json's editor '${String(v)}' is none of ${Object.keys(EDITORS).join(', ')}, off or a program's absolute path: ${EDITORS[DEFAULT_EDITOR].label} instead` };
}

const isExec = (p, platform) => { try { const st = fss.statSync(p); return st.isFile() && (platform === 'win32' || (st.mode & 0o111) !== 0); } catch { return false; } };

/** The editor's program on this computer, or null: a known editor's command on PATH (on Windows its .exe, which runs
 *  without a shell, where a .cmd does not), then where it is installed; a configured program as it is. */
export function findEditor(ed, { env = process.env, platform = process.platform, home = os.homedir(), exec = isExec } = {}) {
  if (ed.off) return null;
  if (ed.program) return exec(ed.program, platform) && !/\.(cmd|bat)$/i.test(ed.program) ? ed.program : null;
  const dirs = String(env.PATH || '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
  const p = platform === 'win32' ? path.win32 : path.posix;
  const out = [];
  if (platform === 'win32') {
    // (…\Microsoft VS Code\bin\code.cmd on PATH: its program one folder up)
    for (const d of dirs) if (exec(p.join(d, `${ed.cli}.cmd`), platform)) out.push(p.join(d, '..', p.basename(ed.win)));
    for (const root of [env.LOCALAPPDATA && p.join(env.LOCALAPPDATA, 'Programs'), env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean)) out.push(p.join(root, ...ed.win.split('/')));
  } else {
    out.push(...dirs.map(d => p.join(d, ed.cli)));
    if (platform === 'darwin') for (const apps of ['/Applications', p.join(home, 'Applications')]) out.push(p.join(apps, ed.app, 'Contents/Resources/app/bin', ed.cli), p.join(apps, ed.app, 'Contents/Resources/app/bin/code'));
    else out.push(...ed.linux);
  }
  return out.find(f => exec(f, platform)) || null;
}

/** The editor's link to a file at a line (the page opens it when the server has no program to run): vscode://file/…. */
export function editorLink(ed, full, line = 1) {
  if (!ed.scheme) return null;
  const slashed = full.replace(/\\/g, '/');
  return `${ed.scheme}://file${encodeURI(slashed.startsWith('/') ? slashed : `/${slashed}`).replace(/#/g, '%23').replace(/\?/g, '%3F')}:${line}`;
}

const LOOPBACK = a => /^(127\.|::1$|::ffff:127\.)/.test(String(a || ''));

/** Whether a page at `remote` (its request's address) may open the editor: { available, label, reason }. */
export function editorAvailability({ remote, ed, found }) {
  if (ed.off) return { available: false, reason: 'Open in editor is turned off in the configuration (config.json: "editor": "off")' };
  if (!LOOPBACK(remote)) return { available: false, label: ed.label, reason: 'the Silinx server runs on another computer: its editor would open there' };
  if (!found && !ed.scheme) return { available: false, label: ed.label, reason: `${ed.program} is not a program this server can run` };
  return { available: true, label: ed.label, how: found ? 'program' : 'link' };
}

/** A project's file (`rel`), or the project's folder (no `rel`), as a path to open: confined to the project, no hidden
 *  file or folder (projects.js's checks), an existing file; not the HDL of a design and simulation project, which its
 *  interface does not show (#3780). Throws an HttpError. */
export async function editorTarget(project, rel) {
  const dir = P.projectDir(project);
  const pj = await P.readProject(project);   // (no such project: its 404)
  if (rel == null || rel === '') return { dir, full: null };
  if (typeof rel !== 'string') throw new P.HttpError(400, 'path must be a string');
  if (isDesignOnly(pj) && hdlSideFile(rel)) throw new P.HttpError(400, DESIGN_ONLY_MESSAGES.hidden(rel));
  const full = await P.spelledJoin(dir, rel);
  P.refuseHidden(dir, rel, full, 'opened');
  let st;
  try { st = fss.statSync(full); } catch { st = null; }
  if (!st?.isFile()) throw new P.HttpError(404, `file '${rel}' not found`);
  return { dir, full };
}

const lineOf = line => {
  if (line == null) return 1;
  const n = Number(line);
  if (!Number.isInteger(n) || n < 1 || n > 1e7) throw new P.HttpError(400, 'line must be a whole number from 1');
  return n;
};

/** Opens a project's file at a line, or its folder, in the editor: { opened, editor, path } once its program started, or
 *  { url, editor } for the page to open (no program found); throws an HttpError when it cannot. `remote`: the asking
 *  page's address (null: this computer's, the MCP server's). */
export async function openInEditor({ project, path: rel, line, remote = '127.0.0.1' }, { cfg = null, env = process.env, spawn = spawnChild, find = findEditor } = {}) {
  const ed = editorSetting((cfg || await loadConfig()).editor, env);
  const exe = ed.off ? null : find(ed, { env });
  const can = editorAvailability({ remote, ed, found: exe });
  if (!can.available) throw new P.HttpError(403, can.reason);
  const ln = lineOf(line);
  const { dir, full } = await editorTarget(project, rel);
  const shown = rel || project;
  if (!exe) {
    if (!full) throw new P.HttpError(404, `${ed.label} was not found on this computer (its '${ed.cli}' command): install it, or put its command on PATH`);
    return { url: editorLink(ed, full, ln), editor: ed.label, path: shown };
  }
  // (its folder first: the window of the project, reused when it is open; then the file at its line)
  const args = full ? [dir, '--goto', `${full}:${ln}`] : [dir];
  await new Promise((resolve, reject) => {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', shell: false, windowsHide: false });
    child.once('error', e => reject(new P.HttpError(500, `${ed.label} could not be started: ${e.code || e.message}`)));
    child.once('spawn', () => { child.unref?.(); resolve(); });
  });
  return { opened: true, editor: ed.label, path: shown };
}

/** GET /api/editor (what the page shows: the command's label, or nothing) and POST /api/editor/open { project, path,
 *  line }. Not under /projects/:p: opening a file changes nothing, and holds no project (project-watch.js). */
export function registerEditorRoutes(api, { wrap }) {
  api.get('/editor', wrap(async req => {
    const ed = editorSetting((await loadConfig()).editor);
    const { available, label, reason } = editorAvailability({ remote: req.socket.remoteAddress, ed, found: ed.off ? null : findEditor(ed) });
    return { available, ...(label ? { label } : {}), ...(reason ? { reason } : {}), ...(ed.error ? { warning: ed.error } : {}) };
  }));
  api.post('/editor/open', wrap(req => {
    const { project, path: rel, line } = req.body || {};
    if (typeof project !== 'string' || !project) throw new P.HttpError(400, 'project is required');
    return openInEditor({ project, path: rel, line, remote: req.socket.remoteAddress });
  }));
}

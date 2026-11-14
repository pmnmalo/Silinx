// Open in VS Code (#4017, server/open-editor.js): config.json's editor read (a known one, a program's path, off, an
// unknown value warned), the editor's program found (on PATH, where it is installed: macOS, Windows, Linux), its link,
// who may ask (a page on this computer only); the route (GET /api/editor, POST /api/editor/open) with a fake editor
// that writes down its arguments: a file at a line, the project's folder; its refusals (a path outside the project, by
// `..` or a symbolic link, a hidden file or folder, a file that is not there, a bad line, no project, a design project's
// HDL, the editor turned off, a command in the request ignored); the link when no program is found; the MCP tool.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { scratchEnv, writeConfig, startApp, POSIX_ONLY } from './server-helpers.js';

let tmp, srv, P, E, fake, log;
before(async () => {
  tmp = await scratchEnv('silinx-open-editor-');
  P = await import('../server/projects.js');
  E = await import('../server/open-editor.js');
  fake = path.join(tmp, 'fake-editor');
  log = path.join(tmp, 'editor.log');
  process.env.FAKE_EDITOR_LOG = log;
  await fs.writeFile(fake, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$FAKE_EDITOR_LOG"\n', { mode: 0o755 });
  await writeConfig({ editor: fake });
  await P.createProject({ name: 'ed' });
  const dir = P.projectDir('ed');
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src', 'top.vhd'), 'entity top is end;\n');
  await fs.writeFile(path.join(dir, 'src', 'a b#1.c'), 'int f(void) { return 1; }\n');
  await fs.mkdir(path.join(dir, '.vscode'), { recursive: true });
  await fs.writeFile(path.join(dir, '.vscode', 'settings.json'), '{}');
  await fs.writeFile(path.join(tmp, 'outside.txt'), 'not the project\'s');
  if (!POSIX_ONLY) await fs.symlink(path.join(tmp, 'outside.txt'), path.join(dir, 'src', 'link.vhd'));
  await P.createProject({ name: 'drawn', kind: 'design' });
  await fs.writeFile(path.join(P.projectDir('drawn'), 'top.vhd'), 'entity top is end;\n');
  srv = await startApp();
});
after(async () => { await srv?.close(); await fs.rm(tmp, { recursive: true, force: true }); });

// the fake editor's arguments, once it ran
async function ran() {
  for (let i = 0; i < 200; i++) {
    try { const t = await fs.readFile(log, 'utf8'); await fs.rm(log); return t.trim().split('\n'); } catch { await new Promise(r => setTimeout(r, 10)); }
  }
  throw new Error('the editor did not run');
}

test('the editor setting: VS Code by default, a known editor, a program, off, an unknown value warned', () => {
  assert.deepEqual(E.editorSetting(undefined, {}), { id: 'code', ...E.EDITORS.code });
  assert.equal(E.editorSetting('', {}).label, 'VS Code');
  assert.equal(E.editorSetting('code-insiders', {}).label, 'VS Code Insiders');
  assert.equal(E.editorSetting('codium', {}).scheme, 'vscodium');
  assert.deepEqual(E.editorSetting('/opt/bin/subl', {}), { program: '/opt/bin/subl', label: 'subl' });
  assert.deepEqual(E.editorSetting('off', {}), { off: true });
  assert.deepEqual(E.editorSetting(false, {}), { off: true });
  assert.deepEqual(E.editorSetting('code', { SILINX_EDITOR: 'off' }), { off: true });
  const bad = E.editorSetting('rm -rf ~', {});
  assert.equal(bad.id, 'code');
  assert.equal(bad.error, "config.json's editor 'rm -rf ~' is none of code, code-insiders, codium, cursor, off or a program's absolute path: VS Code instead");
  assert.equal(E.editorSetting('toString', {}).id, 'code');   // (no name of an object's prototype)
  assert.equal(E.editorSetting('relative/subl', {}).error.startsWith("config.json's editor 'relative/subl'"), true);
});

test('the editor found: on PATH, in the applications of macOS, by its .cmd on Windows, in its install folders', () => {
  const only = files => (f => files.includes(f));
  const code = E.editorSetting('code', {});
  assert.equal(E.findEditor(code, { platform: 'linux', env: { PATH: '/a:/b' }, exec: only(['/b/code']) }), '/b/code');
  assert.equal(E.findEditor(code, { platform: 'linux', env: { PATH: '/a' }, exec: only(['/snap/bin/code']) }), '/snap/bin/code');
  assert.equal(E.findEditor(code, { platform: 'linux', env: { PATH: '/a' }, exec: only([]) }), null);
  const mac = '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
  assert.equal(E.findEditor(code, { platform: 'darwin', env: { PATH: '/usr/bin' }, home: '/h', exec: only([mac]) }), mac);
  const own = '/h/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code';
  assert.equal(E.findEditor(code, { platform: 'darwin', env: { PATH: '' }, home: '/h', exec: only([own]) }), own);
  // Windows: its Code.exe (spawned without a shell, which a .cmd needs), from PATH's bin folder or its install folder
  assert.equal(E.findEditor(code, { platform: 'win32', env: { PATH: 'C:\\VSC\\bin;C:\\x' }, exec: only(['C:\\VSC\\bin\\code.cmd', 'C:\\VSC\\Code.exe']) }), 'C:\\VSC\\Code.exe');
  const user = 'D:\\Profile\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe';
  assert.equal(E.findEditor(code, { platform: 'win32', env: { PATH: '', LOCALAPPDATA: 'D:\\Profile\\AppData\\Local' }, exec: only([user]) }), user);
  assert.equal(E.findEditor(code, { platform: 'win32', env: { PATH: 'C:\\x' }, exec: only(['C:\\x\\code.cmd']) }), null);   // (no Code.exe beside it)
  // a configured program as it is; a .cmd not (no shell)
  assert.equal(E.findEditor({ program: '/opt/subl', label: 'subl' }, { platform: 'linux', exec: only(['/opt/subl']) }), '/opt/subl');
  assert.equal(E.findEditor({ program: 'C:\\e\\ed.cmd', label: 'ed' }, { platform: 'win32', exec: () => true }), null);
  assert.equal(E.findEditor({ off: true }, { exec: () => true }), null);
});

test("the editor's link: its scheme, the path encoded, the line; Windows' drive", () => {
  const code = E.EDITORS.code;
  assert.equal(E.editorLink(code, '/w/ed/src/top.vhd', 12), 'vscode://file/w/ed/src/top.vhd:12');
  assert.equal(E.editorLink(code, '/w/ed/src/a b#1?.c'), 'vscode://file/w/ed/src/a%20b%231%3F.c:1');
  assert.equal(E.editorLink(E.EDITORS['code-insiders'], 'C:\\w\\ed\\top.v', 3), 'vscode-insiders://file/C:/w/ed/top.v:3');
  assert.equal(E.editorLink({ program: '/opt/subl' }, '/w/x'), null);
});

test('who may open it: a page on this computer only, the editor not turned off, a program or a link', () => {
  const code = E.EDITORS.code;
  assert.deepEqual(E.editorAvailability({ remote: '127.0.0.1', ed: code, found: '/b/code' }), { available: true, label: 'VS Code', how: 'program' });
  assert.deepEqual(E.editorAvailability({ remote: '::ffff:127.0.0.1', ed: code, found: null }), { available: true, label: 'VS Code', how: 'link' });
  assert.equal(E.editorAvailability({ remote: '::1', ed: code, found: null }).available, true);
  assert.deepEqual(E.editorAvailability({ remote: '203.0.113.5', ed: code, found: '/b/code' }),
    { available: false, label: 'VS Code', reason: 'the Silinx server runs on another computer: its editor would open there' });
  assert.equal(E.editorAvailability({ remote: '::ffff:198.51.100.7', ed: code, found: '/b/code' }).available, false);
  assert.equal(E.editorAvailability({ remote: undefined, ed: code, found: '/b/code' }).available, false);
  assert.deepEqual(E.editorAvailability({ remote: '127.0.0.1', ed: { off: true } }),
    { available: false, reason: 'Open in editor is turned off in the configuration (config.json: "editor": "off")' });
  assert.deepEqual(E.editorAvailability({ remote: '127.0.0.1', ed: { program: '/opt/subl', label: 'subl' }, found: null }),
    { available: false, label: 'subl', reason: '/opt/subl is not a program this server can run' });
});

test('no program found: the link for the page to open, a folder refused', async () => {
  const find = () => null, cfg = { editor: 'code' };
  const r = await E.openInEditor({ project: 'ed', path: 'src/top.vhd', line: 4 }, { cfg, env: {}, find });
  const p = path.join(P.projectDir('ed'), 'src/top.vhd').replace(/\\/g, '/');   // (Windows: /C:/…)
  assert.deepEqual(r, { url: `vscode://file${p.startsWith('/') ? '' : '/'}${encodeURI(p)}:4`, editor: 'VS Code', path: 'src/top.vhd' });
  await assert.rejects(E.openInEditor({ project: 'ed' }, { cfg, env: {}, find }),
    { status: 404, message: "VS Code was not found on this computer (its 'code' command): install it, or put its command on PATH" });
  // a program that fails to start: its error
  const spawn = () => { const ee = new EventEmitter(); setImmediate(() => ee.emit('error', Object.assign(new Error('x'), { code: 'EACCES' }))); return ee; };
  await assert.rejects(E.openInEditor({ project: 'ed', path: 'src/top.vhd' }, { cfg, env: {}, find: () => '/b/code', spawn }), { status: 500, message: 'VS Code could not be started: EACCES' });
});
test('GET /api/editor: the configured editor, available to this computer; off: not, with its reason', { skip: POSIX_ONLY }, async () => {
  assert.deepEqual((await srv.call('GET', '/editor')).body, { available: true, label: 'fake-editor' });
  await writeConfig({ editor: 'off' });
  try {
    assert.deepEqual((await srv.call('GET', '/editor')).body, { available: false, reason: 'Open in editor is turned off in the configuration (config.json: "editor": "off")' });
    const r = await srv.call('POST', '/editor/open', { project: 'ed', path: 'src/top.vhd' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'Open in editor is turned off in the configuration (config.json: "editor": "off")');
  } finally { await writeConfig({ editor: fake }); }
  // an unknown value: VS Code, with the warning
  await writeConfig({ editor: 'notepad++ --x' });
  try {
    assert.equal((await srv.call('GET', '/editor')).body.warning, "config.json's editor 'notepad++ --x' is none of code, code-insiders, codium, cursor, off or a program's absolute path: VS Code instead");
  } finally { await writeConfig({ editor: fake }); }
});

test('POST /api/editor/open: the file at its line in the project\'s window, the folder alone; a command in the request ignored', { skip: POSIX_ONLY }, async () => {
  const dir = P.projectDir('ed');
  let r = await srv.call('POST', '/editor/open', { project: 'ed', path: 'src/top.vhd', line: 7, command: '/bin/sh', args: ['-c', 'touch /tmp/x'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { opened: true, editor: 'fake-editor', path: 'src/top.vhd' });
  assert.deepEqual(await ran(), [dir, '--goto', `${path.join(dir, 'src', 'top.vhd')}:7`]);
  r = await srv.call('POST', '/editor/open', { project: 'ed', path: 'SRC/a b#1.c' });   // (spelled as on disk, line 1)
  assert.equal(r.status, 200);
  assert.deepEqual(await ran(), [dir, '--goto', `${path.join(dir, 'src', 'a b#1.c')}:1`]);
  r = await srv.call('POST', '/editor/open', { project: 'ed' });
  assert.deepEqual(r.body, { opened: true, editor: 'fake-editor', path: 'ed' });
  assert.deepEqual(await ran(), [dir]);
});

test('POST /api/editor/open: its refusals, the editor never run', { skip: POSIX_ONLY }, async () => {
  const refused = [
    [{ path: 'src/top.vhd' }, 400, 'project is required'],
    [{ project: 'nope', path: 'a.v' }, 404, null],
    [{ project: '../x' }, 400, null],
    [{ project: 'ed', path: '../drawn/top.vhd' }, 400, null],
    [{ project: 'ed', path: '/etc/hosts' }, 400, null],
    [{ project: 'ed', path: 'src/link.vhd' }, 400, 'path escapes project'],
    [{ project: 'ed', path: '.vscode/settings.json' }, 400, "'.vscode/settings.json': not opened: hidden file or folder ('.vscode')"],
    [{ project: 'ed', path: 'src/none.vhd' }, 404, "file 'src/none.vhd' not found"],
    [{ project: 'ed', path: 'src' }, 404, "file 'src' not found"],
    [{ project: 'ed', path: 'src/top.vhd', line: 0 }, 400, 'line must be a whole number from 1'],
    [{ project: 'ed', path: 'src/top.vhd', line: '3; rm' }, 400, 'line must be a whole number from 1'],
    [{ project: 'ed', path: ['src/top.vhd'] }, 400, 'path must be a string'],
    [{ project: 'drawn', path: 'top.vhd' }, 400, 'top.vhd: a design and simulation project does not show its HDL (its drawings are its sources)'],
  ];
  for (const [body, status, error] of refused) {
    const r = await srv.call('POST', '/editor/open', body);
    assert.equal(r.status, status, JSON.stringify(body));
    if (error) assert.equal(r.body.error, error, JSON.stringify(body));
  }
  await new Promise(r => setTimeout(r, 100));
  await assert.rejects(fs.access(log));   // (the editor ran for none of them)
});

test('the MCP tool open_in_editor: the same function, its text and data, its refusals', { skip: POSIX_ONLY }, async () => {
  const { handle } = await import('../server/mcp.js');
  let id = 0;
  const call = async args => (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: 'open_in_editor', arguments: args } })).result;
  let r = await call({ project: 'ed', path: 'src/top.vhd', line: 3 });
  assert.ok(!r.isError);
  assert.equal(r.content[0].text, 'Opened src/top.vhd:3 in fake-editor.');
  assert.deepEqual(r.structuredContent, { project: 'ed', path: 'src/top.vhd', line: 3, editor: 'fake-editor' });
  const dir = P.projectDir('ed');
  assert.deepEqual(await ran(), [dir, '--goto', `${path.join(dir, 'src', 'top.vhd')}:3`]);
  r = await call({ project: 'ed' });
  assert.equal(r.content[0].text, "Opened the project 'ed' in fake-editor.");
  assert.deepEqual(await ran(), [dir]);
  r = await call({ project: 'ed', path: '.vscode/settings.json' });
  assert.equal(r.isError, true);
  assert.match(r.content.map(c => c.text).join('\n'), /'\.vscode\/settings\.json': not opened: hidden file or folder \('\.vscode'\)/);
  r = await call({ project: 'drawn', path: 'top.vhd' });
  assert.equal(r.isError, true);
  assert.match(r.content.map(c => c.text).join('\n'), /top\.vhd: a design and simulation project does not show its HDL/);
});

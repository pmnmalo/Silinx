// Usability tests (#5206, phase 2): a session of a project's lifecycle (lib/session.js's: its steps, its report and
// screenshots on a failure), its document what the page shows and what is on disk (lib/project-actions.js's readers,
// the server's description of the project and its files), checked after every step against the project's model
// (lib/project-model.js): the Design pane's rows, the top, the editors open and the one in front, none with unsaved
// changes, the drawings' errors, no warnings; silinx.json's sources, the top, the bench, the constraints, the files
// removed, every file of the folder; the modules of its HDL files compiled by core (no errors); the console's lines the
// step adds, exactly.
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Session, RUN } from './session.js';
import { projectActions, pageState, consoleLines, consoleCount } from './project-actions.js';
import { tr } from './hdl-actions.js';
import { compile } from '../../../core/compile.js';

/** The project `name` on disk: silinx.json's settings and sources, the folder's files (the server's description). */
export async function diskState(env, name) {
  if (!name) return null;
  const pj = await env.server.api('GET', `/api/projects/${encodeURIComponent(name)}`);
  return { top: pj.top || '', simTop: pj.simTop || '', constraints: pj.constraints, files: pj.files.map((f) => `${f.path}:${f.role}`).sort(),
    excluded: [...(pj.excluded || [])].sort(), tree: [...pj.fileTree].sort() };
}

/** The modules silinx.json's HDL files hold, compiled by core: their names, and the compiler's errors. */
export async function diskModules(env, name, files) {
  const dir = path.join(env.server.workspace, name);
  const srcs = await Promise.all(files.map((f) => f.split(':')[0]).map(async (p) => ({ path: p, lang: p.endsWith('.v') ? 'verilog' : 'vhdl', text: await fsp.readFile(path.join(dir, p), 'utf8') })));
  const lib = compile(srcs);
  return { modules: [...lib.modules.keys()].sort(), errors: lib.errors.filter((e) => e.severity === 'error').map((e) => `${e.file}:${e.line}: ${e.message}`) };
}

const kit = (env) => ({
  actions: (page) => ({
    ...projectActions(page, env),
    getDoc: async () => { const p = await pageState(page); return { page: p, disk: await diskState(env, p.name) }; },
  }),
  invariants: () => ({}), hdlErrors: () => [], detached: () => [], dangling: () => [],
});
// (what differs said on one line, the report's: got and expected)
export const same = (got, want, what) => { try { assert.deepEqual(got, want); } catch { throw new Error(`${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); } };

export class ProjectSession extends Session {
  /** `model`: the project's (lib/project-model.js), changed by each step's `update`. */
  constructor(page, env, opts) { super(page, env, { hdl: false, kit: kit(env), ...opts }); this.model = opts.model; }

  /** The run's language set, the session's start: the Start page, no project. */
  async start() {
    if (RUN.lang !== 'en') await this.page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
    this.docs.push(await this.settled());
  }

  /** A step: `run()` through the interface, `update(model)` what it does to the project; then every invariant, and the
   *  console's lines it added exactly `lines` (in English; each a string or a RegExp; or a function that gives them once
   *  the step is done), translated as the page shows them.
   *  `changes`: whether the page or the disk must change; `model: false`, a step after which no project is open (only
   *  its lines and `expect`); `ignore`: lines a known bug adds, left out (its issue's scenario asserts them). */
  async act(name, args, run, { update = () => {}, lines = [], changes = true, expect, model = true, ignore = [] } = {}) {
    const n = await consoleCount(this.page);
    return this.step(name, args, async () => { await run(); update(this.model); }, {
      changes,
      expect: async (after, before) => {
        const want = typeof lines === 'function' ? await lines() : lines, skip = await this.trs(ignore);
        if (model) await this.check(after);
        await this.lines(n, want, skip);
        if (expect) await expect(after, before);
      },
    });
  }
  trs(list) { return tr(this.page, list); }

  /** The page and the disk against the model. */
  async check(s) {
    const m = this.model, page = this.page;
    same(s.page.name, m.name, 'the project open');
    same(s.page.top, m.top, 'the top');
    same(s.page.rows, await this.shown(m.rows()), 'the Design pane\'s rows');
    // (the editors open, in their tabs' order; the Design Summary is the implementation's, not an editor)
    same(s.page.docs.ids.filter((d) => d !== 'summary'), m.docs, 'the editors open');
    if (m.active) same(s.page.docs.active, m.active, 'the editor in front');
    same(s.page.docs.dirty, [], 'unsaved changes');
    const errors = m.errors(), said = await tr(page, errors.map((e) => e[1]));
    same(s.page.diags, { errors: errors.map((e, i) => `${e[0]}${said[i]}`), warnings: [] }, 'the Errors and Warnings tabs');
    same(s.disk, { top: m.top, simTop: m.simTop, constraints: m.constraints, files: m.files(), excluded: m.excluded(), tree: m.tree() }, 'the project on disk');
    same(await diskModules(this.env, m.name, m.files()), { modules: m.modules(), errors: [] }, 'the HDL files\' modules');
  }

  /** The console's lines from line `n` on (but `skip`'s): exactly `lines` (strings in English, or RegExps). */
  async lines(n, lines, skip = []) {
    const got = (await consoleLines(this.page, n)).filter((l) => !skip.includes(l)), want = await this.trs(lines.map((l) => (typeof l === 'string' ? l : '')));
    const ok = got.length === lines.length && lines.every((l, i) => (typeof l === 'string' ? got[i] === want[i] : l.test(got[i])));
    if (!ok) throw new Error(`the console's lines: got ${JSON.stringify(got)}, expected ${JSON.stringify(lines.map((l, i) => (typeof l === 'string' ? want[i] : String(l))))}`);
  }

  /** Rows in the page's language: the badges' and the primitives' words translated. */
  async shown(rows) {
    if (RUN.lang === 'en') return rows;
    const words = [...new Set(rows.flatMap((r) => [...r.matchAll(/\[([^\]*]+)\*?\]/g)].map((x) => x[1])))];
    const t = Object.fromEntries((await tr(this.page, [...words, '(primitive)'])).map((w, i) => [[...words, '(primitive)'][i], w]));
    return rows.map((r) => r.replace(/\[([^\]*]+)(\*?)\]/g, (_, w, b) => `[${t[w]}${b}]`).replace('(primitive)', t['(primitive)']));
  }
}

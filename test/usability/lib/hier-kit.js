// Usability tests (#5206, phase 4): a design's hierarchy as the project's files on disk have it, the reference of the
// symbols' and the hierarchy's sessions: its modules (its HDL compiled by core, the symbols of their own attached, as
// the IDE makes them), each schematic's checks against them, and the HDL a schematic makes, in VHDL and in Verilog,
// compiled with the modules it instantiates and elaborated; a module's symbol whose pins are not its ports, an instance
// out of date. A session whose drawing is checked against the disk (DiskSession: the files read again after every
// step), the console's lines a step adds.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Session, SCH_KIT } from './session.js';
import { schInvariants, detachedEnds, danglingEnds } from './sch-invariants.js';
import { consoleLines } from './project-actions.js';
import { tr } from './hdl-actions.js';
import { attachSymbols, modulesFromLibrary, findMod, symbolDiff, generateHdl } from '../../../core/schdoc.js';
import { compile, elaborate } from '../../../core/compile.js';

const lc = (s) => String(s).toLowerCase();
const langOf = (p) => (/\.v$/i.test(p) ? 'verilog' : 'vhdl');
export const isHdl = (p) => /\.(vhdl?|v)$/i.test(p);

/** The project's modules from its files ({ path: text }): its HDL compiled, each module's ports, its symbol of its
 *  own attached (<module>.sym.json, its pins in step with its ports): what the IDE's schematics are drawn with. */
export function modulesOf(files) {
  const hdl = Object.entries(files).filter(([p]) => isHdl(p));
  const lib = compile(hdl.map(([p, text]) => ({ path: p, lang: langOf(p), text })));
  const sym = Object.fromEntries(Object.entries(files).filter(([p]) => /\.sym\.json$/i.test(p)));
  return attachSymbols(modulesFromLibrary(lib, { sources: Object.fromEntries(hdl) }), sym);
}

/** What is wrong with a symbol's pins against its module's ports (by name, any case; each once): [] when they are the
 *  same. */
export function symbolPortsWrong(sym, modules) {
  if (!sym) return ['no symbol'];
  const m = findMod(modules, sym.module);
  if (!m) return [`no module '${sym.module}' in the project's HDL`];
  const pins = sym.pins.map((q) => lc(q.name)), ports = m.ports.map((q) => lc(q.name));
  const out = [];
  for (const p of ports) if (!pins.includes(p)) out.push(`port ${p} of ${m.name} has no pin`);
  for (const p of pins) if (!ports.includes(p)) out.push(`pin ${p} is no port of ${m.name}`);
  for (const p of new Set(pins)) if (pins.filter((x) => x === p).length > 1) out.push(`pin ${p} twice`);
  return out;
}

/** The module instances of a schematic out of date against their modules, or whose pins are not their module's ports:
 *  [] when all are up to date. */
export function staleInstances(doc, modules) {
  const out = [];
  for (const s of doc.symbols.filter((x) => x.type === 'module')) {
    const d = symbolDiff(s, modules);
    if (d) out.push(`${s.name} (${s.params.module}) out of date: ${JSON.stringify(d)}`);
    else {
      const w = symbolPortsWrong({ module: s.params.module, pins: s.params.ports || [] }, modules);
      if (w.length) out.push(`${s.name}: ${w.join('; ')}`);
    }
  }
  return out;
}

/** The HDL the schematic makes, in VHDL and in Verilog, compiled with the project's other HDL files (`sources`:
 *  { path: text }, the schematic's own module's left out) and elaborated with it the top: the errors ([] when none). */
export function hierHdlErrors(doc, { modules = {}, sources = {}, langs = ['vhdl', 'verilog'] } = {}) {
  const own = new RegExp(`\\b(entity|module)\\s+${doc.name}\\b`, 'i');
  const others = Object.entries(sources).filter(([p, text]) => isHdl(p) && !own.test(text)).map(([p, text]) => ({ path: p, lang: langOf(p), text }));
  const out = [];
  for (const lang of langs) {
    const g = generateHdl({ ...doc, lang }, { modules, lang });
    for (const d of g.diagnostics.filter((x) => x.severity === 'error')) out.push(`${lang}: generated: ${d.message}`);
    const lib = compile([{ path: g.filename, lang, text: g.code }, ...others]);
    const errs = lib.errors.filter((x) => x.severity === 'error');
    for (const e of errs) out.push(`${lang}: compile: ${e.file}: ${e.message}`);
    if (errs.length) continue;
    for (const e of elaborate(lib, doc.name).diags.filter((x) => x.severity === 'error')) out.push(`${lang}: elaborate: ${e.message}`);
  }
  return out;
}

/** The project's HDL files ({ path: text }) compiled and elaborated with `top` the top: the errors ([] when none). */
export function topErrors(files, top) {
  const lib = compile(Object.entries(files).filter(([p]) => isHdl(p)).map(([p, text]) => ({ path: p, lang: langOf(p), text })));
  const errs = lib.errors.filter((x) => x.severity === 'error').map((e) => `compile: ${e.file}: ${e.message}`);
  return errs.length ? errs : elaborate(lib, top).diags.filter((x) => x.severity === 'error').map((e) => `elaborate: ${e.message}`);
}

/** The project `name`'s files on disk ({ path: text }: its HDL, its drawings and symbols). */
export async function diskFiles(env, name) {
  const dir = path.join(env.server.workspace, name), out = {};
  const pj = await env.server.api('GET', `/api/projects/${encodeURIComponent(name)}`);
  for (const f of pj.fileTree.filter((p) => isHdl(p) || /\.(sch|sym)\.json$/i.test(p))) out[f] = await fsp.readFile(path.join(dir, f), 'utf8');
  return out;
}

/** A schematic's kit checked against `ctx` (its modules and sources, the disk's, DiskSession's). */
export const hierSchKit = (ctx) => ({
  ...SCH_KIT,
  invariants: (d) => schInvariants(d, { modules: ctx.modules, hdl: false }),
  hdlErrors: (d) => hierHdlErrors(d, ctx),
  detached: (b, a, o) => detachedEnds(b, a, { ...o, modules: ctx.modules }),
  dangling: (d, o) => danglingEnds(d, { ...o, modules: ctx.modules }),
});

/** A session whose checks read the project's files again after every step, Undo and Redo (`ctx`: { modules, sources },
 *  shared by the sessions of one project). */
export class DiskSession extends Session {
  constructor(page, env, { ctx, project, ...opts }) { super(page, env, opts); Object.assign(this, { ctx, project }); }
  async settled() {
    const d = await super.settled();
    await this.reread();
    return d;
  }
  async reread() {
    const files = await diskFiles(this.env, this.project);
    this.ctx.sources = Object.fromEntries(Object.entries(files).filter(([p]) => isHdl(p)));
    this.ctx.modules = modulesOf(files);
    this.modules = this.ctx.modules;
  }
}

/** The console's lines from line `n` on: exactly `lines` (in English, translated as the page shows them; a RegExp
 *  matches its line): the error says both. */
export async function sameLines(page, n, lines) {
  const got = await consoleLines(page, n), want = await tr(page, lines.map((l) => (typeof l === 'string' ? l : '')));
  const ok = got.length === lines.length && lines.every((l, i) => (typeof l === 'string' ? got[i] === want[i] : l.test(got[i])));
  if (!ok) throw new Error(`the console's lines: got ${JSON.stringify(got)}, expected ${JSON.stringify(lines.map((l, i) => (typeof l === 'string' ? want[i] : String(l))))}`);
}

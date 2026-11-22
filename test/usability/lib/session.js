// Usability tests (#5148): a scenario's steps, each one done through the interface and checked after it: the drawing's
// invariants (its kit's: the schematic's lib/sch-invariants.js, the circuit's lib/circ-invariants.js), the wires that were attached still attached, what the step expects, the page's
// errors; Undo back to the start and Redo to the end give every step's document again. A failure writes its report
// (the scenario, its seed, its steps, what broke, the documents before and after, the last steps' screenshots) to the
// screenshots' folder (uploaded by the workflow) and says it in lines that start with "USABILITY:", which the
// failure's issue quotes (scripts/report-failure.mjs).
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { schActions } from './sch-actions.js';
import { schInvariants, detachedEnds, danglingEnds, hdlErrors } from './sch-invariants.js';

const SHOTS_KEPT = 5;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const slug = (s) => s.replace(/[^\w.-]+/g, '_').slice(0, 80);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The interface and the language the run uses (SILINX_UI_INTERFACE, SILINX_USABILITY_LANG). */
export const RUN = { ui: process.env.SILINX_UI_INTERFACE || 'silinx', lang: process.env.SILINX_USABILITY_LANG || 'en' };

/** The command that runs a test file again as it ran. */
export function replayCommand(file, seed) {
  const vars = [seed != null && `SILINX_USABILITY_SEED=${seed}`, RUN.ui !== 'silinx' && `SILINX_UI_INTERFACE=${RUN.ui}`,
    RUN.lang !== 'en' && `SILINX_USABILITY_LANG=${RUN.lang}`].filter(Boolean);
  return `${vars.join(' ')}${vars.length ? ' ' : ''}node --test ${file}`;
}

/** The schematic's kit: its actions and its checks (each `(doc, { modules })`). */
export const SCH_KIT = {
  actions: schActions,
  invariants: (d, o) => schInvariants(d, { ...o, hdl: false }),
  hdlErrors, detached: detachedEnds, dangling: danglingEnds,
};

export class Session {
  /** `file`: the test file (for the replay command), `title`: the scenario's, `seed`: a random sequence's; `kit`: the
   *  drawing's actions and checks ({ actions(page), invariants, hdlErrors, detached, dangling }). */
  /** `tolerate(errors)`: whether the errors of any step are ones the session's steps may make (a random sequence's:
   *  a width changed), the HDL then not made. */
  constructor(page, env, { file, title, seed = null, modules = {}, hdl = true, quiet = false, tolerate = null, kit = SCH_KIT }) {
    Object.assign(this, { page, env, file, title, seed, modules, hdl, quiet, tolerate, kit });
    this.a = kit.actions(page);
    this.steps = [];      // [{ name, args }]
    this.docs = [];       // the document at the start and after each step that changed it (Undo's past)
    this.future = [];     // the documents Undo went back from (Redo's)
    this.shots = [];
  }
  get doc() { return this.docs.at(-1); }

  /** The drawing opened (in the run's language), its document as it is checked: it must hold every invariant. */
  async open(file) {
    if (RUN.lang !== 'en') await this.page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
    await this.a.open(file);
    this.docs.push(await this.settled());
    const bad = this.kit.invariants(this.doc, { modules: this.modules });
    if (this.hdl && !bad.errors) { const h = this.kit.hdlErrors(this.doc, { modules: this.modules }); if (h.length) bad.HDL = h; }
    if (Object.keys(bad).length) await this.fail('(the start)', bad);
  }

  /** The editor's document once it stops changing (a move's last render, a re-route). */
  async settled() {
    let d = await this.a.getDoc();
    for (let i = 0; i < 20; i++) {
      await sleep(80);
      const e = await this.a.getDoc();
      if (same(d, e)) return e;
      d = e;
    }
    return d;
  }

  /**
   * One step: `run()` does it through the interface; then the invariants, the wires attached before still attached
   * (but `frees`: the wires it may free), the new wires' loose ends (`stubs` of them), the errors it makes on purpose
   * (`errors`, exactly), `expect(after, before)` (assertions), and that it changed the document (`changes: false`, a step
   * that must not).
   */
  async step(name, args, run, { expect, frees = [], changes = true, errors = this.tolerate, stubs = 0 } = {}) {
    const before = this.doc;
    this.steps.push({ name, args });
    await run();
    const after = await this.settled();
    // (a step that makes errors on purpose, a width that no longer matches its net's: exactly those; the HDL made and
    // elaborated when the drawing has none)
    const bad = this.kit.invariants(after, { modules: this.modules });
    if (this.hdl && !bad.errors) { const h = this.kit.hdlErrors(after, { modules: this.modules }); if (h.length) bad.HDL = h; }
    if (errors) {
      // (`errors` the list, or a function that says whether the errors made are the step's)
      if (typeof errors === 'function' ? errors(bad.errors || []) : same(bad.errors || [], errors)) delete bad.errors;
      else bad.errors = [`got ${JSON.stringify(bad.errors || [])}`, `expected ${typeof errors === 'function' ? 'the step\'s' : JSON.stringify(errors)}`];
    }
    const det = this.kit.detached(before, after, { modules: this.modules, except: typeof frees === 'function' ? frees(after, before) : frees });
    if (det.length) bad['wires come off'] = det;
    // (the ends of the wires the step made that are on nothing: as many as it leaves on purpose, `stubs`)
    const old = new Set(before.wires.map((w) => w.id));
    const loose = this.kit.dangling(after, { modules: this.modules }).filter((e) => !old.has(e.wire));
    if (loose.length !== stubs) bad['loose wire ends'] = [`${loose.length} new, ${stubs} expected`, ...loose.map((e) => e.text)];
    const changed = !same(before, after);
    if (changes && !changed) bad['nothing happened'] = ['the document is the same as before the step'];
    if (!changes && changed) bad['changed'] = ['the document changed'];
    if (expect) { try { await expect(after, before); } catch (e) { bad['expected'] = [e.message.split('\n')[0]]; } }
    if (this.page.errors?.length) bad['page errors'] = [...this.page.errors];
    if (changed) { this.docs.push(after); this.future = []; }
    await this.shot();
    if (Object.keys(bad).length) await this.fail(name, bad, before, after);
    return after;
  }

  /** One Edit ▸ Undo: the document before the last step that changed it. */
  async undo() {
    if (this.docs.length < 2) return;
    this.steps.push({ name: 'undo', args: {} });
    await this.a.undo();
    const d = await this.settled();
    if (!same(d, this.docs.at(-2))) await this.fail('undo', { 'Undo': ['Undo did not give the document before the last step'] }, this.docs.at(-2), d);
    this.future.push(this.docs.pop());
    await this.shot();
  }

  /** One Edit ▸ Redo: the document Undo went back from. */
  async redo() {
    if (!this.future.length) return;
    this.steps.push({ name: 'redo', args: {} });
    await this.a.redo();
    const d = await this.settled();
    if (!same(d, this.future.at(-1))) await this.fail('redo', { 'Redo': ['Redo did not give the document Undo went back from'] }, this.future.at(-1), d);
    this.docs.push(this.future.pop());
    await this.shot();
  }

  /** Undo every step back to the start, each giving the document before it; then Redo every one. */
  async undoRedo() {
    for (let i = this.docs.length - 1; i > 0; i--) {
      this.steps.push({ name: 'undo', args: {} });
      await this.a.undo();
      const d = await this.settled();
      if (!same(d, this.docs[i - 1])) await this.fail('undo', { 'Undo': [`Undo ${this.docs.length - i} did not give the document before step ${i}`] }, this.docs[i - 1], d);
    }
    for (let i = 1; i < this.docs.length; i++) {
      this.steps.push({ name: 'redo', args: {} });
      await this.a.redo();
      const d = await this.settled();
      if (!same(d, this.docs[i])) await this.fail('redo', { 'Redo': [`Redo ${i} did not give the document after step ${i}`] }, this.docs[i], d);
    }
  }

  /** Check Schematic: its warnings and errors, exactly `expected` ('WARNING: …' in English, [] for none). */
  async warnings(expected) {
    const text = await this.a.check();
    const got = [...text.matchAll(/(WARNING|ERROR|AVISO|ERRO): (.*?)(?=(?:WARNING|ERROR|AVISO|ERRO): |Process "|Processo "|$)/gs)].map((m) => `${m[1]}: ${m[2].trim()}`);
    const want = RUN.lang === 'en' ? expected : await this.page.eval(async (l) => { const { t } = await import('/js/i18n.js'); return l.map((x) => t(x)); }, expected);
    try { assert.deepEqual(got, want); } catch { await this.fail('Check Schematic', { 'warnings': [`got ${JSON.stringify(got)}`, `expected ${JSON.stringify(want)}`] }); }
  }

  /** The page's screenshot after a step, the last few kept. */
  async shot() {
    const dir = path.join(this.env.tmp, 'usability-shots');
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${slug(this.title)}-${String(this.steps.length).padStart(3, '0')}.png`);
    try { await this.page.screenshot(file); } catch { return; }
    this.shots.push(file);
    while (this.shots.length > SHOTS_KEPT) await fsp.rm(this.shots.shift(), { force: true });
  }

  /** The report written and said, then the test failed (`quiet`, a shrinking's try: only failed, the error's
   *  `usability` true). */
  async fail(where, bad, before = null, after = null) {
    const message = `${this.title}: ${where}: ${Object.entries(bad).map(([k, v]) => `${k}: ${v[0]}`).join('; ')}`;
    // (what failed, the step and the checks: a shrunk sequence must fail the same way)
    // (and the start of the first thing wrong, its numbers apart: "errors: got [\"error: Short circuit")
    const first = String(Object.values(bad)[0]?.[0] ?? '').replace(/\d+/g, '#').slice(0, 40);
    const signature = `${where}: ${Object.keys(bad).join(', ')}: ${first}`;
    if (this.quiet) throw Object.assign(new assert.AssertionError({ message }), { usability: true, signature });
    const lines = [
      `scenario '${this.title}' (${this.file}), interface ${RUN.ui}, language ${RUN.lang}${this.seed != null ? `, seed ${this.seed}` : ''}`,
      `failed at step ${this.steps.length}: ${where}`,
      ...Object.entries(bad).flatMap(([k, v]) => v.slice(0, 8).map((m) => `${k}: ${m}`)),
      'steps:', ...this.steps.slice(-30).map((s, i, a) => `  ${this.steps.length - a.length + i + 1}. ${s.name} ${JSON.stringify(s.args)}`),
      `replay: ${replayCommand(this.file, this.seed)}`,
    ];
    const dir = path.join(this.env.shotDir, 'usability', slug(this.title));
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, 'report.md'), `${lines.join('\n')}\n`);
    await fsp.writeFile(path.join(dir, 'report.json'), JSON.stringify({ title: this.title, file: this.file, seed: this.seed, run: RUN, where, bad, steps: this.steps, before, after }, null, 1));
    for (const s of this.shots) await fsp.copyFile(s, path.join(dir, path.basename(s))).catch(() => {});
    this.env.keep = true;
    for (const l of lines) console.error(`USABILITY: ${l}`);
    throw Object.assign(new assert.AssertionError({ message }), { usability: true, signature });
  }
}

/** A schematic's session (the schematic's kit). */
export class SchSession extends Session {}

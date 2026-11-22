// Usability tests (#5206, phase 2): the model of a project made through the interface, step after step: its sources
// (each kind of New Source's, by its name), the top, the test bench simulated, the constraints file, the sources
// removed, the documents open. From it what must be true after every step: the Design pane's rows (one per module: the
// top first, then by name; the drawing's badge first, its base marked, [VHDL] / [Verilog] last; a drawing that makes no
// module yet a row of its file's name), the project's files on disk (silinx.json's sources and their roles, every file
// of the folder), the modules their HDL holds, the editors open and the one in front, the drawings' errors.

// each kind: its files (the first its own, `hdl` the HDL it has on disk), its role in silinx.json, its row's badges
// (the project's language VHDL: a Verilog module's translation after its own), the rows of its instances, its editor's
// document (none: a wizard's module, opened by no one), the errors its drawing's check gives while it is open
const KINDS = {
  vhdl: { file: (n) => `src/${n}.vhd`, hdl: true, badges: ['VHDL*'], doc: 'file' },
  verilog: { file: (n) => `src/${n}.v`, hdl: true, badges: ['Verilog*', 'VHDL'], doc: 'file' },
  sch: { file: (n) => `src/${n}.sch.json`, made: (n) => `src/${n}.vhd`, badges: ['Schematic*', 'VHDL'], doc: 'sch' },
  tt: { file: (n) => `src/${n}.bool.json`, made: (n) => `src/${n}.vhd`, badges: ['Algebra*', 'Schematic', 'VHDL'], doc: 'tt' },
  pn: { file: (n) => `src/${n}.pn.json`, made: (n) => `src/${n}.vhd`, badges: ['Petri*', 'FSM', 'VHDL'], doc: 'pn' },
  circ: { file: (n) => `src/${n}.circ.json`, made: (n) => `src/${n}.vhd`, badges: ['Circuit*', 'Schematic', 'VHDL'], doc: 'circ' },
  // (an empty state diagram or ASM chart: no module until a state is drawn)
  fsm: { file: (n) => `src/${n}.fsm.json`, lone: 3, doc: 'fsm', errors: (f) => [[`ERROR:FSM - "${f}": `, 'The diagram has no states: double-click the drawing to add one']] },
  asm: { file: (n) => `src/${n}.asm.json`, lone: 1, doc: 'asm', errors: (f) => [[`ERROR:ASM - "${f}": `, 'The chart has no states'], [`ERROR:ASM - "${f}": `, 'No initial (reset) state selected']] },
  c: { file: (n) => `src/${n}.c`, badges: ['C*', 'VHDL'], doc: 'file' },
  cpp: { file: (n) => `src/${n}.cpp`, badges: ['C++*', 'VHDL'], doc: 'file' },
  clock: { file: (n) => `src/${n}.vhd`, hdl: true, badges: ['Clocking Wizard*', 'VHDL'], kids: ['u_bufg_clk0 - BUFG (primitive)', 'u_dcm - DCM_SP (primitive)', 'u_ibufg - IBUFG (primitive)'] },
  bram: { file: (n) => `src/${n}.vhd`, hdl: true, badges: ['Block Memory*', 'VHDL'], kids: ['u_ram_0_0 - RAMB16_S9 (primitive)'] },
  tb: { file: (n) => `sim/${n}.vhd`, hdl: true, role: 'sim', doc: 'file', simBadges: ['VHDL*'] },
  ucf: { file: (n) => `constraints/${n}.ucf`, doc: 'file' },
  mem: { file: (n) => `src/${n}.mem`, doc: 'file' },
  lab: { file: (n) => `labs/${n}.lab.json`, doc: 'file' },
};
export const KIND_NAMES = Object.keys(KINDS);

const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
const base = (p) => p.split('/').pop();

export class ProjectModel {
  constructor(name) {
    // (view: the Design pane's, Implementation or Simulation; flowFiles: its Implementation view lists the files the
    // flow reads, the constraints and the memory files: the ISE style's)
    Object.assign(this, { name, top: '', simTop: '', constraints: 'constraints/top.ucf', sources: [], docs: [], active: null, view: 'impl', flowFiles: false });
  }
  clone(name) {
    const m = new ProjectModel(name);
    Object.assign(m, { top: this.top, simTop: this.simTop, constraints: this.constraints, sources: this.sources.map((s) => ({ ...s })), docs: [], active: null, view: this.view, flowFiles: this.flowFiles });
    return m;
  }
  source(name) {
    const s = this.sources.find((x) => x.name === name);
    if (!s) throw new Error(`no source ${name} in the model`);
    return s;
  }
  static fileOf(s) { return KINDS[s.kind].file(s.name); }
  static docOf(s) { const k = KINDS[s.kind]; return k.doc ? `${k.doc}:${k.file(s.name)}` : null; }
  /** Every file a source has on disk: its own, and the HDL its drawing makes. */
  static filesOf(s) { const k = KINDS[s.kind]; return [k.file(s.name), ...(k.made ? [k.made(s.name)] : [])]; }
  static hdlOf(s) { const k = KINDS[s.kind]; return k.made ? k.made(s.name) : k.hdl ? k.file(s.name) : null; }

  /** New Source of `kind`: its files, its editor opened in front (a wizard's module: none); the first test bench the
   *  one simulated (`uut`: the module it tests; `simTop` false, none: the ISE style's Simulation view selects it); the
   *  first constraints file the project's when its own is not written. */
  add(kind, name, { uut, simTop = true } = {}) {
    if (!KINDS[kind]) throw new Error(`no kind ${kind}`);
    const s = { kind, name, removed: false, ...(uut ? { uut } : {}) };
    this.sources.push(s);
    this.openDoc(ProjectModel.docOf(s));
    if (kind === 'tb' && simTop && !this.simTop) this.simTop = name;
    if (kind === 'ucf' && !this.tree().includes(this.constraints)) this.constraints = ProjectModel.fileOf(s);
    return s;
  }
  openDoc(id) {
    if (!id) return;
    if (!this.docs.includes(id)) this.docs.push(id);
    this.active = id;
  }
  closeDoc(id) {
    const i = this.docs.indexOf(id);
    if (i < 0) return;
    this.docs.splice(i, 1);
    if (this.active === id) this.active = this.docs[Math.min(i, this.docs.length - 1)] ?? null;
  }
  /** Remove from Project: its files stay in the folder, out of the project; its editor closed. */
  remove(name) { const s = this.source(name); s.removed = true; this.closeDoc(ProjectModel.docOf(s)); }
  /** Undo of Remove from Project: back in the project (its editor not reopened). */
  restore(name) { this.source(name).removed = false; }
  /** Rename… of a module: its file renamed with it (its editor's too), the top and the bench simulated follow. */
  rename(name, to) {
    const s = this.source(name), old = ProjectModel.docOf(s);
    s.name = to;
    if (this.top === name) this.top = to;
    for (const x of this.sources) if (x.uut === name) x.uut = to;
    const i = this.docs.indexOf(old);
    if (i >= 0) { this.docs[i] = ProjectModel.docOf(s); if (this.active === old) this.active = this.docs[i]; }
  }
  setTop(name) { this.source(name); this.top = name; }

  /** The project folder's files (the removed ones too), sorted. */
  tree() { return this.sources.flatMap((s) => ProjectModel.filesOf(s)).sort(); }
  /** silinx.json's sources, "path:role", sorted: the HDL files of the sources in the project. */
  files() {
    return this.sources.filter((s) => !s.removed && ProjectModel.hdlOf(s)).map((s) => `${ProjectModel.hdlOf(s)}:${KINDS[s.kind].role || 'design'}`).sort();
  }
  /** silinx.json's excluded: the removed sources' own files. */
  excluded() { return this.sources.filter((s) => s.removed).map((s) => ProjectModel.fileOf(s)).sort(); }
  /** The modules the HDL files on disk hold (silinx.json's), sorted. */
  modules() { return this.sources.filter((s) => !s.removed && ProjectModel.hdlOf(s)).map((s) => s.name).sort(); }

  /** The Design pane's rows under the device's (as lib/project-actions.js designRows reads them, in English): in the
   *  Simulation view the test benches too, each with its unit under test, which is no row of its own; the flow's
   *  files under the top (none: after the modules). */
  rows() {
    const live = this.sources.filter((s) => !s.removed), sim = this.view === 'sim';
    const benches = sim ? live.filter((s) => s.kind === 'tb') : [], tested = new Set(benches.map((b) => b.uut));
    const top = sim ? null : this.top;
    const mods = [...live.filter((s) => KINDS[s.kind].badges && !tested.has(s.name)), ...benches].sort((a, b) => (b.name === top) - (a.name === top) || natural(a.name, b.name));
    const lone = live.filter((s) => KINDS[s.kind].lone).sort((a, b) => KINDS[a.kind].lone - KINDS[b.kind].lone || natural(a.name, b.name));
    const flow = this.flowFiles && !sim ? [...(this.tree().includes(this.constraints) ? [this.constraints] : []), ...this.tree().filter((f) => f.endsWith('.mem'))].map(base) : [];
    const atTop = mods.some((s) => s.name === top);
    const row = (s, label, indent = '') => {
      const k = KINDS[s.kind];
      return [`${indent}${s.name === top ? '▲' : ''}${label} ${(k.badges || k.simBadges).map((b) => `[${b}]`).join(' ')} (${base(k.file(s.name))})`, ...(k.kids || []).map((x) => `${indent}  ${x}`),
        ...(s.name === top ? flow.map((f) => `${indent}  ${f}`) : [])];
    };
    return [
      ...mods.flatMap((s) => [...row(s, s.name), ...(s.uut ? row(this.source(s.uut), `uut - ${s.uut}`, '  ') : [])]),
      ...(atTop ? [] : flow),
      ...lone.map((s) => base(ProjectModel.fileOf(s))),
    ];
  }
  /** The errors the open drawings' checks give, in their documents' order: [its tag and file, its message]. */
  errors() {
    return this.docs.flatMap((id) => {
      const s = this.sources.find((x) => ProjectModel.docOf(x) === id);
      return s && KINDS[s.kind].errors ? KINDS[s.kind].errors(ProjectModel.fileOf(s)) : [];
    });
  }
}

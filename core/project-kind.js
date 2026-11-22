// A project's kind (#3780): an FPGA project (every project before, `kind` absent), or a design and simulation project
// (`kind: 'design'`) for the classes that never touch an FPGA: drawings and simulation only, no board, no constraints, no
// implementation, emulation or programming, and no HDL shown. The core stays HDL-based: every drawing still makes its HDL
// file, checked and simulated as in any project; the project keeps an internal device (the default) for the core's
// checks, never shown. One set of rules and messages for the interface, the local server, the browser edition and the
// MCP server. Isomorphic module (browser + Node).

import { codesignOn, CODESIGN_OFF } from './build-channel.js';
import { CODESIGN_ORDER } from './examples.js';

export const DESIGN_KIND = 'design';
/** The design and simulation project's kind, as New Project, Design Properties and Open Project name it (#5133: for
 *  the introductory courses, whose students need not know what an FPGA is: no FPGA or HDL in its name). */
export const DESIGN_ONLY_LABEL = 'Digital Logic';

/** A co-design project's kind (roadmap #4695, #4702): FPGA and microcontroller nodes linked in its one System document
 *  (`<name>.sys.json`, core/system-doc.js), its top; no board of its own (each FPGA node names its own). */
export const CODESIGN_KIND = 'codesign';
/** The co-design examples (New Project's Start from for a co-design project; the others are FPGA projects'). */
export const CODESIGN_EXAMPLES = CODESIGN_ORDER;
/** The examples offered in this build (New Project, the MCP's list_examples): the co-design ones only where co-design is
 *  on (#5202). */
export const offeredExamples = names => names.filter(n => codesignOn() || !CODESIGN_EXAMPLES.includes(n));
/** Whether a project (its silinx.json) is a co-design project. */
export const isCodesign = pj => pj?.kind === CODESIGN_KIND;
/** New Project's first page (#5041): the three kinds, each with what it is for and what it shows (#5133: Digital Logic's
 *  says nothing of FPGA, HDL or a board); `short`, the MCP server's
 *  new_project's words for its kind (its arguments' size limits, #4752, #5097). */
export const PROJECT_KINDS = [
  { id: DESIGN_KIND, name: DESIGN_ONLY_LABEL, about: 'Digital logic for the introductory courses: schematics, truth tables, state machines and circuits on a breadboard, drawn and simulated.',
    short: 'drawings and simulation, no board, no HDL shown' },
  { id: 'fpga', name: 'FPGA', about: 'A design that runs on a board: HDL sources and drawings, simulated, synthesized, implemented and programmed on the FPGA, or emulated.',
    short: 'the default' },
  { id: CODESIGN_KIND, name: 'Co-design', about: 'A system of FPGA and microcontroller nodes linked together, designed and simulated as one.',
    short: 'FPGA and microcontroller nodes in a System' },
];

/** Why a project of `kind` cannot start from `template`, or why `kind` is no kind (New Project, the server's and the
 *  browser edition's stores, the MCP's new_project: one rule, one message), or null. */
export function createRefusal(kind, template = 'empty') {
  const empty = !template || template === 'empty';
  if (kind != null && kind !== DESIGN_KIND && kind !== CODESIGN_KIND) return `unknown project kind '${kind}'`;
  if (kind === DESIGN_KIND && !empty) return 'a design and simulation project starts empty: no example';
  // (co-design not in a release yet, #5202: core/build-channel.js)
  if ((kind === CODESIGN_KIND || CODESIGN_EXAMPLES.includes(template)) && !codesignOn()) return CODESIGN_OFF;
  if (kind === CODESIGN_KIND && !empty && !CODESIGN_EXAMPLES.includes(template)) return `a co-design project starts empty or from a co-design example (${CODESIGN_EXAMPLES.join(', ')})`;
  return null;
}

/** Why an example of `json` (its silinx.json) cannot be made with a board or a device, or null: a co-design example has
 *  none (its System names each FPGA node's). */
export function boardRefusal(json, { board, device } = {}) {
  return isCodesign(json) && (board || device) ? `${json.name}: a co-design project has no board: its System names each FPGA node's` : null;
}

/** A new co-design project's silinx.json: no board, no constraints, no top module (its System is its top). */
export const asCodesignProject = json => ({ ...json, kind: CODESIGN_KIND, board: null, constraints: null, top: '' });

/** Whether a project (its silinx.json) is a design and simulation project. */
export const isDesignOnly = pj => pj?.kind === DESIGN_KIND;

// the files that belong to the HDL side of a project: HDL, C / C++ (Silinx HLS), constraints, memory images
const HDL_SIDE = /\.(vhdl?|v|sv|vh|svh|c|cc|cpp|cxx|h|hh|hpp|ucf|pcf|xdc|lpf|cst|ccf|mem|hex|coe)$/i;
const HDL_FILE = /\.(vhdl?|v|sv)$/i;
/** Whether `path` is a file of the HDL side (an HDL, C, constraints or memory file): none is added to a design project. */
export const hdlSideFile = path => HDL_SIDE.test(String(path || ''));
/** Whether `path` is an HDL file (generated from a drawing or a test bench in a design project: never shown). */
export const hdlFile = path => HDL_FILE.test(String(path || ''));

/** The messages (the interface's console and dialogs and the MCP server's results say the same). */
export const DESIGN_ONLY_MESSAGES = {
  ise: name => `the project '${name}' is a design and simulation project (no FPGA): it is exported as a Silinx project, not as an ISE project`,
  hdl: path => `${path}: a design and simulation project has drawings only: choose a board in Design Properties to add HDL sources`,
  hidden: path => `${path}: a design and simulation project does not show its HDL (its drawings are its sources)`,
  notation: n => `notation ${n}: a design and simulation project shows no HDL (its drawings are its sources)`,
  flow: name => `the project '${name}' is a design and simulation project (no FPGA): choose a board in Design Properties to implement, emulate or program it`,
  language: () => 'a design and simulation project has no HDL language (its drawings are its sources)',
  toDesign: (name, files) => `the project '${name}' cannot become a design and simulation project: its HDL and C sources are not drawings (${files.join(', ')})`,
  // what a change of kind does, said in Design Properties as the kind is chosen (#5041): nothing is deleted
  toDesignNote: 'Its board and its constraints file leave the project (the file stays on the disk); its drawings stay, their HDL and the test benches hidden, none deleted.',
  toFpgaNote: 'Its HDL and the FPGA flow are shown, nothing lost: choose its board or its device.',
};

/** Why `path` cannot be added to the project `pj` (an HDL-side file in a design project), or null. */
export const addRefusal = (pj, path) => (isDesignOnly(pj) && hdlSideFile(path) ? DESIGN_ONLY_MESSAGES.hdl(path) : null);

/** A new project's silinx.json made a design project: no board, no constraints (the device kept, internal). */
export const asDesignProject = json => ({ ...json, kind: DESIGN_KIND, board: null, constraints: null });

/**
 * The project made an FPGA project for `board` and `device` (Design Properties' board, #3780): the kind dropped, the
 * board's device, its constraints file to be written (`constraints` the path, by the device's format: `ext`).
 */
export function asFpgaProject(pj, { board, device, ext = '.ucf' }) {
  const out = { ...pj, board: board ?? null, device: device || pj.device, constraints: pj.constraints || `constraints/top${ext}` };
  delete out.kind;
  return out;
}

/**
 * The design sources that keep an FPGA project from becoming a design project: its HDL and C sources that no drawing
 * makes (`generated`: the paths the project's drawings generate). Its test benches (simulation sources) are kept, as
 * the Test Bench Wizard's are: hidden.
 */
export function ownSources(pj, generated = []) {
  const gen = new Set(generated);
  return (pj.files || []).filter(f => f.role !== 'sim' && hdlSideFile(f.path) && !/\.(ucf|pcf|xdc|lpf|cst|ccf)$/i.test(f.path) && !gen.has(f.path)).map(f => f.path);
}

/** The project made a design project, or { error } (its own HDL or C sources, `ownSources`): no board, no constraints
 *  (the file left on the disk, out of the project). */
export function toDesignProject(pj, generated = []) {
  const own = ownSources(pj, generated);
  if (own.length) return { error: DESIGN_ONLY_MESSAGES.toDesign(pj.name, own) };
  return { project: asDesignProject(pj) };
}

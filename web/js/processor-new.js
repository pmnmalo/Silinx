// Silinx - New Project's processor boards (#5756, roadmap #5753: core/processor-board.js): the Board card's Board Type (FPGA,
// Arduino, PIC24, Raspberry Pi Pico, ESP32; the processors' where Systems are on: their machinery is a System's, #5202,
// web/js/project-kind-step.js), the settings page's board list then that type's boards; a processor board chosen, the FPGA's fields are
// hidden (a Pico's Python firmware shown), the summary says its firmware, and Finish makes a Board project of that board
// alone, its starter firmware opened; or, from one of its type's examples (#5874: core/examples.js PROCESSOR_EXAMPLES), that
// example on the board chosen, its program opened.
import { PROCESSOR_BOARDS, boardType, boardsOfType, isProcessorBoard, processorProject, processorProjectText, processorNodeId, starterFiles, exampleOnBoard, processorExampleText } from '/core/processor-board.js';
import { isSystemFile, mcuBoard, readSystem } from '/core/system-doc.js';
import { RUNTIME_NAMES } from '/core/rp2040-firmware.js';
import { systemsOn } from '/core/build-channel.js';
import { api } from './api.js';
import { app } from './app.js';
import { h } from './ui.js';
import { appLog } from './console.js';

/** The board list `boardSel` given the processor boards after the FPGA ones, where Systems are on (Board Type shows one
 *  type's at a time). */
export function addProcessorBoards(boardSel) {
  if (!systemsOn()) return;
  boardSel.append(...PROCESSOR_BOARDS.map(b => h('option', { value: b.id, 'data-no-i18n': true, 'data-type': b.arch }, b.name)));   // (names: data)
}

/**
 * The processor board's fields of New Project's settings page: { runtimeSel, rows (a Pico's Python firmware, its label and
 * select), sync(fpga, type, example) (the board list the Board Type's boards, `type` the Mode page's: an FPGA's, or a
 * processor's, its first chosen; the FPGA's fields `fpga` hidden while a processor board is chosen, the runtime shown for
 * a Pico that starts from no example),
 * chosen() (the processor board, or null) }.
 */
export function processorFields(boardSel) {
  const runtimeSel = h('select', {}, ...['micropython', 'circuitpython'].map(r => h('option', { value: r, 'data-no-i18n': true }, RUNTIME_NAMES[r])));
  const label = h('label', {}, 'Python Firmware:');
  const chosen = () => (isProcessorBoard(boardSel.value) ? boardSel.value : null);
  const sync = (fpga, type, example = false) => {
    // (the board list the type's: FPGA its FPGA boards and None Specified, a processor's its boards)
    for (const o of boardSel.options) o.hidden = o.disabled = (o.dataset.type ?? 'fpga') !== type;
    if (boardType(boardSel.value) !== type) {
      boardSel.value = type === 'fpga' ? '' : boardsOfType(type)[0]?.id ?? '';
      boardSel.dispatchEvent(new Event('change'));
    }
    const p = chosen();
    if (p) for (const el of fpga) for (const x of [el, el.previousElementSibling]) if (x && x !== boardSel && x !== boardSel.previousElementSibling) x.style.display = 'none';
    // (an example's Python is its own, #5874)
    for (const x of [label, runtimeSel]) x.style.display = mcuBoard(p)?.runtimes && !example ? '' : 'none';
  };
  return { runtimeSel, rows: [label, runtimeSel], sync, chosen };
}

/** New Project's summary of a processor board's project (from the example `template`, or its starter). */
export function processorSummary(name, board, runtime, template = 'empty') {
  const b = mcuBoard(board), start = starterFiles(board, processorNodeId(board), b.runtimes ? runtime : null);
  const example = template && template !== 'empty';
  return 'Project Navigator will create a new project with the following specifications.\n\n'
    + `Project:\n  Project Name: ${name}\n${example ? `  Template:     ${template}\n` : ''}  Mode:         Board\n\n`
    + `Board:\n  Board:        ${b.name}\n  Processor:    ${b.mcu}`
    + (example ? '' : `\n\nFirmware:\n  ${start.firmware ? `Starter:      ${start.firmware}` : 'Starter:      none (its .hex, MPLAB X\'s)'}${b.runtimes ? `\n  Python:       ${RUNTIME_NAMES[runtime]}` : ''}`);
}

// a node's program as the user reads it: a .hex's sketch or assembly beside it, else the firmware itself
const sourceOf = (fw, files) => (/\.hex$/i.test(fw) ? ['.ino', '.asm'].map(x => fw.replace(/\.hex$/i, x)).find(f => files.includes(f)) ?? fw : fw);

// the Board project `name` made from the processor board's example `template` on `board` (one of its type's) and opened,
// its program opened, its line in the console (#5874)
async function createFromExample(name, board, template) {
  await api.createProject({ name, template });
  const pj = await api.project(name), files = pj.fileTree || [];
  delete pj.fileTree;
  const sys = files.find(isSystemFile);
  const r = exampleOnBoard(pj, { path: sys, text: await api.readFile(name, sys) }, board);
  if (r.error) throw new Error(r.error);
  for (const w of r.writes) await api.writeFile(name, w.path, w.text);
  if (r.writes.length) await api.saveProject(name, r.project);
  const node = readSystem(r.writes[0]?.text ?? await api.readFile(name, sys)).system.nodes.find(n => n.kind === 'mcu');
  await app.openProject(name);
  if (node?.firmware) await app.openFile(sourceOf(node.firmware, files));
  appLog(processorExampleText(name, template, board, node?.firmware), 'info');
  return r;
}

/** The Board project `name` of the processor board `board` made (its System of one node, its starter firmware; or the
 *  example `template`, #5874) and opened, its firmware opened, its line in the console. */
export async function createProcessorProject(name, board, runtime, template = 'empty') {
  if (template && template !== 'empty') return createFromExample(name, board, template);
  const rt = mcuBoard(board).runtimes ? runtime : null;
  await api.createProject({ name, template: 'empty', kind: 'embedded' });
  const pj = await api.project(name);
  delete pj.fileTree;
  const r = processorProject(pj, board, { runtime: rt });
  if (r.error) throw new Error(r.error);
  for (const w of r.writes) await api.writeFile(name, w.path, w.text);
  await api.saveProject(name, r.project);
  await app.openProject(name);
  if (r.firmware && !/\.hex$/.test(r.firmware)) await app.openFile(r.firmware);
  else if (r.firmware) await app.openFile(r.firmware.replace(/\.hex$/, '.asm'));
  appLog(processorProjectText(name, board, r.firmware), 'info');
  return r;
}

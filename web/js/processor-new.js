// Silinx - New Project's processor boards (#5756, roadmap #5753: core/processor-board.js): the Board card's Board Type (FPGA,
// Arduino, PIC24, Raspberry Pi Pico, ESP32; the processors' where Systems are on: their machinery is a System's, #5202,
// web/js/project-kind-step.js), the settings page's board list then that type's boards; a processor board chosen, the FPGA's fields are
// hidden (a Pico's Python firmware shown), the summary says its firmware, and Finish makes a Board project of that board
// alone, its starter firmware opened. A processor's type has no example to start from.
import { PROCESSOR_BOARDS, boardType, boardsOfType, isProcessorBoard, processorProject, processorProjectText, processorNodeId, starterFiles } from '/core/processor-board.js';
import { mcuBoard } from '/core/system-doc.js';
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
 * select), sync(fpga, type) (the board list the Board Type's boards, `type` the Mode page's: an FPGA's, or a processor's,
 * its first chosen; the FPGA's fields `fpga` hidden while a processor board is chosen, the runtime shown for a Pico),
 * chosen() (the processor board, or null) }.
 */
export function processorFields(boardSel) {
  const runtimeSel = h('select', {}, ...['micropython', 'circuitpython'].map(r => h('option', { value: r, 'data-no-i18n': true }, RUNTIME_NAMES[r])));
  const label = h('label', {}, 'Python Firmware:');
  const chosen = () => (isProcessorBoard(boardSel.value) ? boardSel.value : null);
  const sync = (fpga, type) => {
    // (the board list the type's: FPGA its FPGA boards and None Specified, a processor's its boards)
    for (const o of boardSel.options) o.hidden = o.disabled = (o.dataset.type ?? 'fpga') !== type;
    if (boardType(boardSel.value) !== type) {
      boardSel.value = type === 'fpga' ? '' : boardsOfType(type)[0]?.id ?? '';
      boardSel.dispatchEvent(new Event('change'));
    }
    const p = chosen();
    if (p) for (const el of fpga) for (const x of [el, el.previousElementSibling]) if (x && x !== boardSel && x !== boardSel.previousElementSibling) x.style.display = 'none';
    for (const x of [label, runtimeSel]) x.style.display = mcuBoard(p)?.runtimes ? '' : 'none';
  };
  return { runtimeSel, rows: [label, runtimeSel], sync, chosen };
}

/** New Project's summary of a processor board's project. */
export function processorSummary(name, board, runtime) {
  const b = mcuBoard(board), start = starterFiles(board, processorNodeId(board), b.runtimes ? runtime : null);
  return 'Project Navigator will create a new project with the following specifications.\n\n'
    + `Project:\n  Project Name: ${name}\n  Mode:         Board\n\n`
    + `Board:\n  Board:        ${b.name}\n  Processor:    ${b.mcu}\n\n`
    + `Firmware:\n  ${start.firmware ? `Starter:      ${start.firmware}` : 'Starter:      none (its .hex, MPLAB X\'s)'}${b.runtimes ? `\n  Python:       ${RUNTIME_NAMES[runtime]}` : ''}`;
}

/** The Board project `name` of the processor board `board` made (its System of one node, its starter firmware) and
 *  opened, its firmware opened, its line in the console. */
export async function createProcessorProject(name, board, runtime) {
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

// Silinx - a processor board's shield in the interface (#5898, core/processor-shield.js): the board's row's Add Shield
// process (an Arduino's, a Pico's, an ESP32's Board project with none), its circuit written and opened in the Circuit
// editor, the line in the console; the refusals there too, said as the MCP's add_shield says them.
import { S, app } from './app.js';
import { api } from './api.js';
import { appLog, commandError } from './console.js';
import { shownSystem } from './design-system.js';
import { addShield, shieldOf, shieldText, shieldable } from '/core/processor-shield.js';
import { processorBoardOf } from '/core/processor-board.js';

/** Whether the board's row (its node `id`) offers Add Shield: a processor board's Board project's board, with no shield. */
export function canAddShield(id) {
  const board = processorBoardOf(S.project), sys = shownSystem()?.system;
  return !!board && shieldable(board) && !!sys && !shieldOf(sys) && sys.nodes.some(n => n.id === id && n.kind === 'mcu');
}

/** Add Shield: the shield's circuit and the System written, the project read again, the circuit opened. */
export async function addShieldUi() {
  const name = S.project?.name, s = shownSystem();
  if (!name || !s?.file) return;
  try {
    const r = addShield(S.project, { path: s.file, text: await api.readFile(name, s.file) });
    if (r.error) { commandError('Add Shield', r.error); return; }
    for (const w of r.writes) await api.writeFile(name, w.path, w.text);
    await app.reloadProject();
    await app.openFile(r.circuit);
    appLog(shieldText(name, processorBoardOf(S.project), r.circuit), 'info');
  } catch (e) { commandError('Add Shield', e.message); }
}

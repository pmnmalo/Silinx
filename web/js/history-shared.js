// The project's Undo / Redo (web/js/history.js) in a project shared live with editors (#5739, phase 1 of #5743): each
// participant undoes their own commands only. Merged three ways into the project as it is now (core/history-merge.js),
// so that the editors' changes made since stay; where they overlap the command's, nothing is undone and the console says
// it (a warning: whose change it was is not known, the project's is kept). An editor's page too (#5760): its own
// commands, recorded through the room's backend (history.attach), undone so into the shared document.
//   sharedUndo(project) -> { shared, merge, conflict, regenerate }      history.js's hooks, spread into createHistory's
import { collab } from './collab-state.js';
import { mergeStep, conflictsLine } from '/core/history-merge.js';
import { logWarning } from './console.js';

/** The hooks of the project's history (project(): the open project's name) for a project this page shares. */
export function sharedUndo(project) {
  return {
    // (the owner's page, or an editor's, #5760: its Undo through the room's backend, into the shared document)
    shared: () => (collab.role === 'owner' || (collab.role === 'follower' && collab.editor)) && !!project() && collab.project === project(),
    merge: mergeStep,
    conflict: (e, side, conflicts) => logWarning(`${side === 'before' ? 'Undo' : 'Redo'}: ${e.label}: not ${side === 'before' ? 'undone' : 'redone'}: ${conflictsLine(conflicts)} changed since in the same places; the project kept as it is.`),
    regenerate: async paths => {
      const { syncDrawingHdl } = await import('./drawings.js');
      for (const p of paths) await syncDrawingHdl(p).catch(() => {});
    },
  };
}

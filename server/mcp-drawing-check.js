// Silinx - the drawings' HDL files checked before the MCP's flows (#5872, core/drawing-sync.js checkDrawings), as the
// interface checks them before its runs (web/js/drawing-check.js): a drawing replaced in the project's folder has its
// HDL made again, an HDL file edited by hand is kept in a version and made again from its drawing (a warning), before
// the tool reads the sources. A drawing with errors is the flow's to say (its stale HDL an error, #303, #5799).
import * as P from './projects.js';

/** The tools that run a flow on the project's sources: the drawings checked before each. */
export const FLOW_TOOLS = new Set(['check_syntax', 'check_constraints', 'simulate', 'simulate_drawing', 'verify', 'run_process', 'timing_paths',
  'export_project', 'grade', 'check_system', 'c_simulation', 'c_cosimulation']);

/** The drawings of the tool's project checked before it runs (server/mcp.js): the lines to say (what was made again,
 *  the HDL files changed outside Silinx), [] for none or another tool. */
export async function checkBeforeTool(tool, args) {
  if (!FLOW_TOOLS.has(tool) || typeof args?.project !== 'string') return [];
  try { await P.readProject(args.project); } catch { return []; }   // (no such project: the tool's own error)
  const { checkDrawings } = await import('./drawing-sync.js');
  try {
    const r = await checkDrawings(P, args.project);
    return r.results.filter(x => !x.stale).flatMap(x => x.messages);
  } catch (e) { return [`WARNING: the drawings' HDL files not checked: ${e.message}`]; }
}

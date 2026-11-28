// A System's FPGA node's reports in Implement's tree (#5632): its Design Summary (its row's first, web/js/summary.js for
// the node: its device, module, utilization, timing, files) and its steps' reports under them, as an FPGA project's: its
// Synthesis Report under Synthesize, its Static Timing Report under Implement Design. They are the local server's
// (GET /projects/:p/reports?node=<id>: build/nodes/<id>/build/reports.json, the Silinx toolchain's); a report not made
// yet is said in the console. The MCP's get_report with node reads the same.
import { S, app } from './app.js';
import { api } from './api.js';
import { logError } from './console.js';

// a step's reports: [id, label, the report's flag in reports.json, its file in the node's build folder (its module's)]
const STEP_REPORTS = {
  synth: [['synrep', 'View Synthesis Report', 'synthesis', (m) => `open/${m}_stat.txt`]],
  impl: [['timing', 'View Static Timing Report', 'timing', () => 'open/timing.txt']],
};

// a report of the node opened, or why not said
async function openNodeReport(id, label, flag, file) {
  const rep = await api.reports(S.project.name, id).catch((e) => ({ available: false, error: e.message }));
  if (rep.error) { logError(`${label}: ${rep.error}`); return; }
  if (rep.available === false || !rep[flag]) { logError(`${label}: no report yet for System node ${id}: run its Implement Design first`); return; }
  app.openFile(`${rep.dir}/${file(rep.module)}`);
}

/** The node's Design Summary row (its row's first; `row`: its id, the Processes pane's 'summary' in place of the project's). */
export const nodeSummaryRow = (id, row = `impl-summary-${id}`) => ({ id: row, label: 'Design Summary/Reports', ico: 'summary', run: async () => (await import('./impl-views.js')).openSummary({ node: id }) });

/** The reports' rows of the node `id`'s step `step` (synth, impl, bitgen). */
export const nodeStepReports = (id, step) => (STEP_REPORTS[step] || []).map(([k, label, flag, file]) => ({ id: `impl-${k}-${id}`, label, ico: 'summary', run: () => openNodeReport(id, label, flag, file) }));

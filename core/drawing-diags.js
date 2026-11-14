// A drawing that makes no module (#3934): one with errors and no HDL file yet (a state diagram with two states of one
// name), which Check Syntax (Check Design in a design and simulation project) told only as "top module … not found".
// When the design needs it (its module the top, or one the elaboration does not find), its errors are Check Syntax's
// diagnostics instead, on the drawing, the fix said, as for a drawing whose HDL file it cannot make again (#303); its
// module, the top, then not elaborated. A drawing the design does not use (a new one, still empty) says nothing there.
// One set of messages for the interface (web/js/processes.js) and the MCP server's check_syntax (server/mcp-util.js
// elaborateView). Isomorphic module (browser + Node).

/** The drawings' failures (`failed`: [{ path, module, errors: ['path: message', …] }], viewHdl's) as diagnostics; a
 *  design project's (`design`) say its module, an FPGA project's its HDL. */
export function drawingDiags(failed = [], { design = false } = {}) {
  return failed.filter(f => f?.errors?.length).map(({ path, errors }) => {
    const why = errors.map(e => String(e).replace(`${path}: `, '')).join('; ');
    return { severity: 'error', file: path, line: 0, col: 0, tool: 'Silinx', drawn: true,
      message: design ? `its module is not made: ${why}. Fix ${path}.` : `its HDL cannot be made: ${why}. Fix ${path} (its HDL is then made).` };
  });
}

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
/** Whether the module `mod` is one a failed drawing would make (the top: not elaborated, its errors said instead). */
export const failedModule = (failed = [], mod) => failed.some(f => f?.errors?.length && same(f.module, mod));

// a "… not found" error naming the module `m`
const names = (d, m) => /not found/i.test(d?.message || '') && new RegExp(`(^|[^\\w])${String(m).replace(/[^\w]/g, '\\$&')}([^\\w]|$)`, 'i').test(d.message);
/** The check's diagnostics (`diags`) with the failed drawings the design needs: the top's (`top`), and those whose
 *  module an error says is not found, that error replaced by their errors. */
export function withDrawingErrors(diags, failed = [], { top, design = false } = {}) {
  const used = failed.filter(f => f?.errors?.length && f.module && (same(f.module, top) || diags.some(d => names(d, f.module))));
  return [...diags.filter(d => !used.some(f => names(d, f.module))), ...drawingDiags(used, { design })];
}

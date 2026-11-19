// core/trust.js (#2830, #4583): refusedProject, the project a refusal for an untrusted project names in a console's
// line (the console gives that line its Trust Project button): every origin's refusal of every process, as the error
// itself, its "… failed:" line, the MCP's program_board text; nothing for the line said when the project opens nor for
// any other error. untrustedMessage, the text the MCP server answers too, unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrusted, refusedProject, untrustedMessage, untrustedNotice, markUntrusted, markMadeByMcp, markEditedByEditor, markMerged } from '../core/trust.js';

const PROCESSES = ['programming the board', 'programming the PROM', 'Xilinx ISE', 'AMD Vivado'];
const OUTSIDE = [markUntrusted({ name: 'p' }), markMadeByMcp({}), markEditedByEditor({}), markMerged({})];

test('untrustedMessage: the refusal\'s text, unchanged (the interface\'s and the MCP server\'s)', () => {
  assert.equal(untrustedMessage('Lab 3', 'programming the board'), "project 'Lab 3' came from outside (imported): programming the board runs only once you trust it (Trust Project, in the console when the project opens)");
  assert.equal(untrustedMessage('p', 'Xilinx ISE', { madeBy: 'mcp' }), "project 'p' was made through the MCP server (by an assistant): Xilinx ISE runs only once you trust it (Trust Project, in the console when the project opens)");
});

test('refusedProject: every origin\'s refusal of every process, alone, as a "… failed:" line, as the MCP\'s', () => {
  for (const pj of OUTSIDE) {
    assert.equal(isTrusted(pj), false);
    for (const what of PROCESSES) {
      for (const name of ['Lab3', 'Lab 3 (final)', "Ana's", 'a.b*c']) {
        const m = untrustedMessage(name, what, pj);
        assert.equal(refusedProject(m), name, m);
        assert.equal(refusedProject(`ERROR: ${m}`), name);
        assert.equal(refusedProject(`ERROR: Programming FPGA (SRAM) failed: ${m}`), name);
        assert.equal(refusedProject(`program_board: ${m}`), name);
      }
    }
  }
});

test('refusedProject: null for the line said when the project opens, any other error, nothing', () => {
  for (const pj of OUTSIDE) assert.equal(refusedProject(untrustedNotice('p', pj)), null);
  for (const t of ['', 'ERROR: Programming FPGA (SRAM) failed: no bitstream build/top.bit in this browser', "project 'p' came from outside (imported)",
    "project 'p' came from somewhere: programming the board runs only once you trust it", 'Project "p" trusted: Xilinx ISE and programming a board or a PROM may run for it.']) {
    assert.equal(refusedProject(t), null, t);
  }
  assert.equal(refusedProject(null), null);
  assert.equal(refusedProject(undefined), null);
});

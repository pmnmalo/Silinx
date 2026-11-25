// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Check Constraints of a constraints file (#4732), in its format by its name: a UCF's by ucf.js checkUcf, a PCF's, an
// LPF's, a CST's, a CCF's, an XDC's and a QSF's by core/constraints-check.js; each problem ConstraintSystem's, in the file. The
// interface's check (web/js/implement.js ucfDiagnostics) and the MCP's check_constraints (server/mcp-constraints.js)
// give the same. Isomorphic module (browser + Node).

import { checkUcf } from '../packages/silinx-fpga/src/parts.js';
import { constraintsDiagnostics } from './constraints-check.js';

/**
 * The problems of constraints file `file` (its path) of text `text`: ports (the top's, ucfPort's; none when it does not
 * elaborate), top (its name), lang (its language, a UCF's names), device, board (boardOfProject's), iostandards (the
 * family's I/O standards, a UCF's and a QSF's). [{ severity, line, message, file, tool }].
 */
export function constraintsFileDiagnostics(file, text, { ports = [], top = null, lang = 'vhdl', device = null, board = null, iostandards = null } = {}) {
  const ext = String(file).split('.').pop().toLowerCase();
  const diags = ext === 'ucf' ? checkUcf(text, { top, ports, lang, iostandards, board, package: device?.package })
    : constraintsDiagnostics(ext, text, ext === 'xdc' ? { ports } : { ports, top, device, board, iostandards });
  return diags.map(d => ({ ...d, file, tool: 'ConstraintSystem' }));
}

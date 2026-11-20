// A tool's log line's severity (#4730): the one classifier of the console (web/js/console.js logLine), a process's
// count of warnings (web/js/implement.js) and the MCP's run_process (server/mcp-processes.js), so the three agree.
// Errors: ISE's "ERROR:Xst:123 - …", "INTERNAL_ERROR:…", "FATAL_ERROR:…", Yosys's and nextpnr's "ERROR: …", Vivado's
// "ERROR: [Synth 8-…] …", "FATAL…", a compiler's "f.v:12: error: …" or "f.vhd:3:5: error: …". Warnings: ISE's
// "WARNING:Xst:…", Vivado's "CRITICAL WARNING: […]", Yosys's and nextpnr's "Warning: …", "f.v:12: warning: …".

// (no letter or digit before "ERROR:": "INTERNAL_ERROR:" and "FATAL_ERROR:" are errors, "NOERROR:" is not)
const ERROR_LINE = /^\s*(ERROR|FATAL)\b|(?<![A-Za-z0-9])ERROR:/i;
const WARNING_LINE = /^\s*(CRITICAL )?WARNING\b|(?<![A-Za-z0-9])WARNING:/i;

/** 'error', 'warning' or null (information) of a log's line. */
export function severityOf(line) {
  const s = String(line);
  return ERROR_LINE.test(s) ? 'error' : WARNING_LINE.test(s) ? 'warning' : null;
}

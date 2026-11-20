// A tool's message's file and line (#4746): the Errors / Warnings tabs' row opens it (web/js/console.js), the MCP's
// run_process returns it (server/mcp-processes.js). The forms: ISE's `"/…/src/f.vhd" Line 12` (XST, HDLCompiler),
// Vivado's `[/…/src/f.vhd:12]`, NgdBuild's `[top.ucf(3)]`, a compiler's `f.vhd:12:5: …` (GHDL, Icarus, Yosys,
// SilinxC's `f.c:4: …`).

// (the files a project holds: HDL, constraints, C / C++; a time "12:30" or an address "host:22" is none)
const EXT = '(?:vhdl?|v|sv|vh|svh|ucf|xdc|pcf|lpf|cst|sdc|c|cc|cpp|h|hpp)';
const FORMS = [
  new RegExp(`"([^"]+)"\\s*,?\\s*[Ll]ine\\s+(\\d+)`),                         // ISE
  new RegExp(`\\[([^\\[\\]\\s]+\\.${EXT}):(\\d+)\\]`),                       // Vivado
  new RegExp(`\\[([^\\[\\]\\s()]+\\.${EXT})\\((\\d+)\\)\\]`),                 // NgdBuild's constraints
  new RegExp(`(?:^|[\\s'"(])([^\\s'"():]*[^\\s'"():\\d][^\\s'"():]*\\.${EXT}):(\\d+)(?::(\\d+))?`),   // a compiler's
];

/** { file, line, col? } of a message's text (the file as the tool wrote it: a path or a name), or null. */
export function messageLocation(text) {
  const s = String(text);
  for (const re of FORMS) {
    const m = re.exec(s);
    if (m && +m[2] > 0) return { file: m[1], line: +m[2], ...(m[3] ? { col: +m[3] } : {}) };
  }
  return null;
}

/** The project's path (one of `paths`, as "src/f.vhd") of a file a tool named: the same path, a path ending with it
 *  (the tool's absolute path, or its own folder's), else the only one of the same name; null when none or several. */
export function projectPath(file, paths) {
  if (!file) return null;
  const f = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  if (paths.includes(f)) return f;
  const tail = paths.filter(p => f.endsWith('/' + p));
  if (tail.length) return tail.sort((a, b) => b.length - a.length)[0];
  const base = f.split('/').pop();
  const same = paths.filter(p => p.split('/').pop() === base);
  return same.length === 1 ? same[0] : null;
}

// Silinx - a design and simulation project in the interface (#3780, core/project-kind.js): no board, no flow, no HDL
// shown. The process tree and the tasks are its tool descriptor's (DESIGN_ONLY, web/js/tool-descriptors.js); what else
// the interface hides there goes through these helpers: the menus' items of the flow, the HDL's badges and files, the
// HDL languages, Check Syntax's name; and an HDL file brought in is refused, the MCP server's message in the console.
import { DESIGN_ONLY_MESSAGES, addRefusal, hdlSideFile, isDesignOnly } from '/core/project-kind.js';
import { S, status } from './app.js';
import { logError, logInfo } from './console.js';

/** Whether the open project is a design and simulation project. */
export const designOnly = () => isDesignOnly(S.project);
/** The items, unless the open project is a design project (the flow's menu items, toolbar buttons…). */
export const flowOnly = (...items) => (designOnly() ? [] : items);
// the badges of the HDL (a module's language, its translation)
const HDL_BADGES = new Set(['VHDL', 'Verilog']);
/** A Design row's badges, its HDL's left out in a design project. */
export const withoutHdlBadges = badges => (designOnly() ? badges.filter(b => !HDL_BADGES.has(b.text)) : badges);
/** The files a list shows (the Files tab), the HDL side's (HDL, C, constraints, memory) left out in a design project. */
export const shownFiles = files => (designOnly() ? files.filter(f => !hdlSideFile(f)) : files);
/** A module's language after its name (" (VHDL)"), none in a design project (#3891). */
export const langNote = lang => (designOnly() ? '' : ` (${lang === 'verilog' ? 'Verilog' : 'VHDL'})`);
/** A drawing's HDL made again, or not (its status line): none in a design project (#3891). */
export const hdlStatus = text => { if (!designOnly()) status(text); };
/** A drawing's HDL not made again (`text`: the console's warning naming its HDL file): in a design project the drawing's
 *  module named instead, why it is not (#3891). */
export const hdlWarning = (text, drawing, why) => (designOnly() ? `WARNING: ${drawing}: its module is not made again: ${why}` : text);
/** A diagnostic as a design project shows it (#3891): an HDL file's, its drawing's (no line: the HDL's lines are not the
 *  drawing's), the checker Silinx. */
export function shownDiag(d) {
  if (!designOnly()) return d;
  const drawing = hdlSideFile(d.file) && S.hdlToSch?.[d.file];
  return { ...d, ...(drawing ? { file: drawing, line: 0 } : {}), tool: !d.tool || d.tool === 'HDLCompiler' ? 'Silinx' : d.tool };
}
/** Check Syntax's name: Check Design in a design project (its sources are drawings). */
export const checkLabel = (label = 'Check Syntax') => (designOnly() ? 'Check Design' : label);
/** Whether `path` is refused in the open project (an HDL-side file in a design project): the refusal in the console. */
export function refusedHere(path) {
  const why = addRefusal(S.project, path);
  if (why) logError(why);
  return !!why;
}
/** An HDL file opened in a design project (a message's link, a search's result): its drawing opened instead, else why
 *  not (the MCP server's read_file says the same). */
export async function hiddenHdl(path) {
  const drawing = S.hdlToSch?.[path];
  if (drawing) return (await import('./drawings.js')).openView(drawing);
  logInfo(DESIGN_ONLY_MESSAGES.hidden(path));
}

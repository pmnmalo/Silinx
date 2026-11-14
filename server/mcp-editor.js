// The MCP server's Open in VS Code (#4017): a project's file at a line, or its folder, opened in the user's editor on
// this computer, through the interface's function (server/open-editor.js openInEditor), with its checks and messages:
// the editor config.json names (or "off"), a file of the project (no hidden file or folder), never a program of the
// call's. The MCP server runs on the user's computer, as a page of the server there does.
import { toolError, readProject, PROJECT } from './mcp-util.js';
import { openInEditor } from './open-editor.js';

export const EDITOR_TOOLS = [
  {
    name: 'open_in_editor', title: 'Open in VS Code',
    description: 'Open a project\'s file (an HDL, C / C++, constraints or any text file) at a line, or the project\'s folder (no path), in the user\'s editor on this computer: VS Code, or the one config.json\'s "editor" names (code-insiders, codium, cursor, a program\'s path; "off" turns it off). The user sees it open; what they save there is the project\'s file (read_file reads it). Refused for a hidden file or folder, a path outside the project, or when the editor is turned off or not found.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      path: { type: 'string', description: 'The file, relative to the project folder (src/top.vhd); none: the project\'s folder.' },
      line: { type: 'integer', minimum: 1, description: 'The line the editor goes to (default 1).' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run({ project, path, line }) {
      await readProject(project);
      let r;
      try { r = await openInEditor({ project, path, line, remote: '127.0.0.1' }); } catch (e) { throw toolError(e.message); }
      // (no program to run: a page would open the editor's link; the MCP server has no page)
      if (!r.opened) throw toolError(`${r.editor} was not found on this computer: install it, or put its command on PATH`);
      const where = path ? `${path}${line ? `:${line}` : ''}` : `the project '${project}'`;
      return { text: `Opened ${where} in ${r.editor}.`, data: { project, path: path || null, line: line || null, editor: r.editor } };
    },
  },
];

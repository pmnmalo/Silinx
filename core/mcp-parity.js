// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// What the interface does, the MCP server does too (#2674, #4751): every action of the menu bar and the MCP tools that do
// it, or why it has none: the view alone (zoom, layout, theme, language, tabs, a viewer), the open editor's own editing
// (its result written by write_file or a drawing's tool), or an exception, the user's own (trusting a project, #2830; this
// computer's toolchain settings). test/ui/mcp-parity.test.js walks the menus in both interfaces: an action not here
// fails it, and a tool named here must be one of the server's. Pure data.

/** Why a menu action has no tool: the view alone. */
export const VIEW = 'the view alone (#2674): zoom, layout, theme, language, tabs, a viewer';
/** Why a menu action has no tool: the open editor's own editing; its result written with write_file or a drawing's tool. */
export const EDITOR = 'the open editor\'s own editing: its result written with write_file or a drawing\'s tool';
/** The exceptions (#2830): what only the user does, in the interface. */
export const EXCEPTIONS = {
  // (Pedro, 2026-11-20: machine configuration is the user's, as trusting a project is; read only through toolchain_info)
  toolchain: 'this computer\'s toolchain settings (ISE\'s mode and paths, an SSH host and user, the programmers\' paths) are the user\'s, set in the interface only, as trusting a project is (#2830): a client could otherwise point ISE at any program and run it; toolchain_info reads what they found, with no host, user or path',
  identity: 'who the user is (their name for the usage counts and the classroom) is said by the user only',
  updates: 'the check for a new release of Silinx is the interface\'s own (the MCP server runs the copy installed)',
  github: 'signing in to GitHub (its token, the user\'s credentials) is the user\'s, in the interface; the MCP server uses the account signed in',
  storage: 'where the browser edition keeps its projects (the browser\'s storage or a folder the user picks) is the user\'s choice; the MCP server\'s workspace is SILINX_WORKSPACE',
  emulator: 'the Board Emulator is played by the user (its switches and buttons pressed live); its design\'s simulation: simulate, simulate_drawing',
};

/**
 * The menu bar's actions, by their path ('Menu > Item', a submenu's 'Menu > Submenu > Item'), and what does each in the MCP
 * server: its tools ([names]), or { view }, { editor } or { exception } (a reason), with the tools that read its state
 * (`tools`) when there are some. The paths in English, the interface's own labels.
 */
export const MENU_PARITY = {
  'File > New Project…': ['new_project', 'new_project_from_example', 'list_examples'],
  'File > Open Project…': ['list_projects', 'project_info'],
  'File > Import Project…': ['import_project'],
  'File > Export Project (.zip)…': ['export_project'],
  'File > Share Project…': ['share_project', 'follow_project', 'project_link'],
  'File > Open from GitHub Repository…': ['git_repositories', 'git_clone'],
  'File > Short Links…': ['short_links', 'delete_short_link'],
  'File > Store Project in a GitHub Repository…': ['git_init'],
  'File > Changes…': ['git_status', 'git_diff'],
  'File > Commit…': ['git_commit'],
  'File > Commit and Push…': ['git_commit', 'git_push'],
  'File > Sign in with GitHub…': { exception: EXCEPTIONS.github, tools: ['git_repositories'] },
  'File > Sign out of GitHub': { exception: EXCEPTIONS.github },
  'File > Open Workspace Folder…': { exception: EXCEPTIONS.storage, tools: ['list_projects'] },
  'File > Copy Browser Projects to the Folder': { exception: EXCEPTIONS.storage },
  'File > Use Browser Storage': { exception: EXCEPTIONS.storage },
  'File > Push to GitHub': ['git_push'],
  'File > Pull from GitHub': ['git_pull'],
  'File > History…': ['git_log'],
  'File > GitHub Checks': ['git_checks'],
  'File > New Branch…': ['git_branch'],
  'File > Switch Branch…': ['git_switch'],
  'File > Merge Branch…': ['git_merge'],
  'File > Rename Project…': ['rename_project'],
  'File > Close Project': { view: VIEW },
  'File > Print…': { view: VIEW },
  'File > Recent Projects > Clear Recent Projects': { view: VIEW },
  'Edit > Undo': { editor: EDITOR },
  'Edit > Redo': { editor: EDITOR },
  'Edit > Cut': { editor: EDITOR },
  'Edit > Copy': { editor: EDITOR },
  'Edit > Paste': { editor: EDITOR },
  'Edit > Delete': { editor: EDITOR },
  'Edit > Find…': { editor: EDITOR },
  'Edit > Replace…': { editor: EDITOR },
  'Edit > Go to Line…': { view: VIEW },
  'Edit > Find in Project…': ['find_in_project'],
  'Edit > Design Checks (Lint Warnings)': ['check_syntax'],
  'View > Command Palette…': { view: VIEW },
  'View > Design Summary': ['get_report'],
  'View > Implementation': { view: VIEW },
  'View > Simulation': { view: VIEW },
  'View > Split Editor': { view: VIEW },
  'View > Boolean Notation > Electronics / Engineering': ['set_notation'],
  'View > Boolean Notation > Logic / Set theory': ['set_notation'],
  'View > Boolean Notation > Text only': ['set_notation'],
  'View > Boolean Notation > VHDL': ['set_notation'],
  'View > Boolean Notation > Verilog': ['set_notation'],
  'View > Schematic Symbols > IEC 60617-12 (rectangular)': ['set_schematic_symbols'],
  'View > Schematic Symbols > IEEE Std 91-1984 (distinctive shapes)': ['set_schematic_symbols'],
  'View > Interface > Silinx': { view: VIEW },
  'View > Interface > ISE style': { view: VIEW },
  'View > Language > English': { view: VIEW },
  'View > Language > Português': { view: VIEW },
  'View > Theme > Light': { view: VIEW },
  'View > Theme > Dark': { view: VIEW },
  'View > Theme > System': { view: VIEW },
  'Project > New Source…': ['new_source', 'clock_manager', 'block_memory', 'test_bench_wizard', 'constraints_wizard'],
  'Project > Add to Project…': ['add_to_project'],
  'Project > Import Source…': ['import_source'],
  'Project > Add Copy of Source…': ['import_source'],
  // (a source's or a file's copy, its modules renamed, #5862: rename_file's copy)
  'Project > Duplicate…': ['rename_file'],
  'Project > Set as Top Module': ['set_top'],
  'Project > Design Properties…': ['set_design_properties'],
  // (a project's mode, #5755: set_design_properties's mode; its versions, #5740)
  'Project > Change Mode…': ['set_design_properties'],
  'Project > Save Version…': ['save_version'],
  'Project > Versions…': ['list_versions', 'version_diff', 'restore_version'],
  'Project > Merge Contribution…': ['merge_preview', 'merge_contribution'],
  'Project > Undo Merge': ['undo_merge'],
  'Project > Guided Labs…': ['lab'],
  'Project > Exercise…': ['grade'],
  'Process > Check Syntax': ['check_syntax'],
  'Process > Implement Top Module': ['run_process'],
  'Process > Simulate Behavioral Model': ['simulate'],
  'Process > Run': ['run_process'],
  // (a call cancelled by its client: notifications/cancelled, #4734)
  'Process > Stop': { view: 'a run stopped: the MCP client cancels its call (notifications/cancelled)' },
  'Tools > ASM State Machine Editor…': ['new_source', 'write_file', 'check_drawing', 'simulate_drawing'],
  'Tools > FSM State Diagram Editor…': ['new_source', 'write_file', 'set_fsm_outputs', 'set_fsm_look', 'set_fsm_condition'],
  'Tools > Boolean Algebra / Karnaugh Map…': ['new_source', 'write_file', 'related_view', 'set_output_logic'],
  'Tools > Petri Net Editor…': ['new_source', 'write_file', 'simulate_drawing'],
  'Tools > RTL Schematic': { view: VIEW },
  'Tools > I/O Pin Planning': ['constraints_wizard', 'check_constraints'],
  'Tools > Implemented Design (FPGA View)': { view: VIEW, tools: ['timing_paths'] },
  'Tools > Board Emulator': { exception: EXCEPTIONS.emulator, tools: ['simulate', 'simulate_drawing'] },
  'Tools > iMPACT (Configure Target Device)': ['program_board', 'program_prom', 'jtag_scan', 'bitstream_info'],
  'Tools > Toolchain Settings (ISE / Programmers)…': { exception: EXCEPTIONS.toolchain, tools: ['toolchain_info'] },
  'Window > Close All Documents': { view: VIEW },
  'Window > Design Summary': ['get_report'],
  'Help > Keyboard Shortcuts': { view: VIEW },
  'Help > Check for Updates…': { exception: EXCEPTIONS.updates },
  'Help > Check for Updates at Start-up': { exception: EXCEPTIONS.updates },
  'Help > Tell Us Who You Are…': { exception: EXCEPTIONS.identity },
  'Help > About Silinx': { view: VIEW },
};

/** The MCP tools a menu action's entry names (none: it has no entry, or its entry names none). */
export const toolsOf = (path) => {
  const e = MENU_PARITY[path];
  return Array.isArray(e) ? e : e?.tools || [];
};

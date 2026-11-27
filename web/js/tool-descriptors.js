// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The tool descriptors moved to core/tool-descriptors.js (#4751: pure data, the MCP server's too); its importers here keep
// importing them from this module.
export {
  OPEN_SYNTH, SYNTH_OPEN, EXTRA_STEPS, FLOW_PROCS, IMPL_IDS, MESSAGE_LINE, ISE, SILINX, SILINX_ICE40, SILINX_XC7, SILINX_ECP5,
  SILINX_GOWIN, SILINX_GATEMATE, SILINX_MISTRAL, NO_FLOW, DESIGN_ONLY, VIVADO, TOOLS, toolOf, allTasks, hasTask, simModelsOf, processSteps, buildProcesses,
} from '../../core/tool-descriptors.js';

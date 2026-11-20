// What a new project starts with (#4828), the same for the local server (server/projects.js createProject) and the
// browser edition (web/js/project-store.js emptyProjectJson). Isomorphic module (browser + Node).

/** A new project's Process Properties: Optimization Fast (Speed, Normal: GOAL_IMPL.fast of the toolchain's package,
 *  #4828), the FPGA start-up clock the JTAG clock. A project read with none keeps reading as Fast (synthGoal, #2470). */
export const NEW_IMPL = Object.freeze({ optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' });

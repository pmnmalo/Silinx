In short:

- **Following the owner's simulation:** a viewer's own copy of the owner's simulation now keeps up with it: it runs to
  the same time, restarts when the owner does, and shows the same signals, cursor, markers and zoom. Clicking in it
  yourself is browsing alone.

In detail:

- **The owner's simulations (part 3 of #4002, core/collab-sim.js, web/js/collab-sim.js):** a channel of the owner's
  activity, `sim`, gives each open SSim (at most 8) the time it has reached, a key of its drawn stimuli, its forces and
  its wave view (the signals shown, their radix and groups, the cursor, the markers, the zoom, the run time, the
  instance shown; not the panels' sizes). The viewer's page runs its own SSim of the same files to the same time (the
  simulator is deterministic, so the waves are the same), runs it again from 0 when the forces change or the owner
  restarted, runs the simulation again when the drawn stimuli change, and then puts the owner's view on it. A click, a
  key or the wheel in the viewer's SSim is browsing alone. SSim's API gives the time reached (`now`).
- **MCP (#4002):** `follow_project` gives the owner's simulations (`ownerActivity.sim`, and a line for each in its
  text: the time, the cursor, the signals shown, the forces).

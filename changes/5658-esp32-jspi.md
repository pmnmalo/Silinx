In short:

- **An ESP32 on JSPI:** where the browser has JSPI (today's Chrome, Edge, Firefox and Safari), a System's ESP32 runs its
  MicroPython on the System's own thread, with no SharedArrayBuffer; elsewhere in a Worker as before. The console says
  which, and both give the same run.

In detail:

- **The ESP32 node's JSPI back end (#5658):** `esp32JspiEngine` (`core/esp32-engine.js`, the program's state shared with the
  Worker + Atomics back end) runs Silinx's own MicroPython build (#5694) on the scheduler's thread, its `silinx_jspi.wait()`
  suspending the program between the scheduler's commands; the node's `advanceTo` is then a promise, and the scheduler
  runs such a System with `runAsync` (`core/system-sim.js`: the same windows, the same run), as the System's Web Worker
  and the MCP's `simulate` do. Picked by feature detection (`esp32Backend`), forced by the page's `?esp32=worker` or
  `?esp32=jspi`; the console says which (`ESP32 <id>: MicroPython on this thread (JSPI)`, `in a Worker (Atomics)`). The
  build downloaded once from the release `micropython-wasm-v1.29.0-1`, checked by its SHA-256 (declared for `pins.yml`)
  and served at `/vendor/micropython-jspi/` (`server/micropython-jspi.js`). The modules read a JavaScript array from either
  build. NOTICE and THIRD-PARTY-NOTICES. Tests: system-sim (runAsync), micropython-jspi-server, mcp-system-esp32 (its back
  end said), check-pins; the UI's system-esp32 in both interfaces: JSPI by default, and one System on both back ends with
  the same run.

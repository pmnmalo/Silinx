In short:

- **Closing a circuit works again:** a circuit's tab, or its project, closes with no "stopTicks is not defined" error.

In detail:

- **A circuit's editor destroyed with no error (#5403):** `web/js/circuit-editor.js` `destroy()` called `stopTicks()`.
  Since the Try it split (#5357) that function is circuit-try.js's, so the editor now calls `tryIt.stopTicks()`. The
  split's other names (startSim, stopSim, setInput, runSim, toggleSim) were already wrapped. Test: the UI's
  circuit-close (a tab closed, closed while trying it, the project closed; no error; both interfaces), which fails on
  the old code.

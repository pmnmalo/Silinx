In detail:

- **Silinx's own MicroPython build for the ESP32 node's JSPI back end (part of #5658):** MicroPython's webassembly port
  (v1.29.0, MIT) built with a pinned emsdk (6.0.13) as Silinx's variant: the pyscript variant's configuration with
  `sys.settrace`, WebAssembly's exceptions (no JavaScript setjmp trampolines, which JSPI cannot suspend across) and JSPI,
  with the module `silinx_jspi` (its `wait()` a suspending import, the run `silinx_exec` a promising export) and
  `runPythonSuspending` beside `loadMicroPython` (`scripts/micropython-wasm/`). The workflow
  `.github/workflows/micropython-wasm.yml` builds it on a pull request that changes it, twice and compared byte by byte,
  and runs its smoke test in Node with JSPI; run by hand on main, it publishes the build as a release of this repository
  (`micropython-wasm-v1.29.0-<build>`). Both pins are declared for `pins.yml`. The back end that downloads and runs it
  follows.

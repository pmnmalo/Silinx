
// Silinx (#5658, scripts/micropython-wasm/build.sh): appended to its MicroPython build's micropython.mjs, beside
// loadMicroPython. runPythonSuspending(mp, code, wait) runs code as runPython does, through the promising export
// silinx_exec: each silinx_jspi.wait() of the code awaits wait() (a promise of a number), the page's thread free
// meanwhile; it resolves with the code's result, or rejects with its PythonError. MicroPython's JavaScript reads the
// global Module: this instance's is put there before the run (and by wait()'s import on resuming).
export async function runPythonSuspending(mp, code, wait) {
    const Module = mp._module;
    Module.silinxWait = wait;
    globalThis.Module = Module;
    const len = Module.lengthBytesUTF8(code);
    const buf = Module._malloc(len + 1);
    Module.stringToUTF8(code, buf, len + 1);
    const value = Module._malloc(3 * 4);
    try {
        await Module.ccall("silinx_exec", "null", ["pointer", "number", "pointer"], [buf, len, value], { async: true });
    } finally {
        Module._free(buf);
    }
    globalThis.Module = Module;
    return proxy_convert_mp_to_js_obj_jsside_with_free(value);
}

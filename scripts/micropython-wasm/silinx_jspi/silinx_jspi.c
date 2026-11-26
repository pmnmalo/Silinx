// Silinx's module silinx_jspi (#5658), in its MicroPython build (scripts/micropython-wasm/build.sh): an ESP32 node's
// program waits for the scheduler without blocking the page's thread. silinx_jspi.wait() calls Module.silinxWait(),
// which returns a promise: JSPI suspends the WebAssembly stack (the program, its trace) until the promise resolves, and
// wait() returns its number. The program runs through silinx_exec, a promising export (MicroPython's mp_js_do_exec, its
// result as runPython's), so the page's code awaits it. MicroPython's JavaScript side reads the global Module: on resuming,
// this instance's is put back (several nodes, each its own MicroPython, on one page).
#include <emscripten.h>
#include "py/runtime.h"

EM_ASYNC_JS(int, silinx_jspi_suspend, (void), {
    const n = await Module.silinxWait();
    globalThis.Module = Module;
    return n | 0;
});

static mp_obj_t silinx_jspi_wait(void) {
    return mp_obj_new_int(silinx_jspi_suspend());
}
static MP_DEFINE_CONST_FUN_OBJ_0(silinx_jspi_wait_obj, silinx_jspi_wait);

static const mp_rom_map_elem_t silinx_jspi_globals_table[] = {
    { MP_ROM_QSTR(MP_QSTR___name__), MP_ROM_QSTR(MP_QSTR_silinx_jspi) },
    { MP_ROM_QSTR(MP_QSTR_wait), MP_ROM_PTR(&silinx_jspi_wait_obj) },
};
static MP_DEFINE_CONST_DICT(silinx_jspi_globals, silinx_jspi_globals_table);

const mp_obj_module_t silinx_jspi_module = {
    .base = { &mp_type_module },
    .globals = (mp_obj_dict_t *)&silinx_jspi_globals,
};
MP_REGISTER_MODULE(MP_QSTR_silinx_jspi, silinx_jspi_module);

void mp_js_do_exec(const char *src, size_t len, uint32_t *out);

// (the program run: a promising export, its stack suspended at each wait())
EMSCRIPTEN_KEEPALIVE void silinx_exec(const char *src, size_t len, uint32_t *out) {
    mp_js_do_exec(src, len, out);
}

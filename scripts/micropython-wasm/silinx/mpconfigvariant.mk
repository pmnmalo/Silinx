# Silinx's variant of MicroPython's webassembly port (#5658, scripts/micropython-wasm/build.sh): the pyscript variant's,
# with JSPI and WebAssembly's own exceptions. JSPI suspends a WebAssembly stack only when no JavaScript frame is on it, so
# setjmp / longjmp (MicroPython's nlr) are WebAssembly's exceptions, not Emscripten's invoke_* trampolines in JavaScript
# (the Makefile's SUPPORT_LONGJMP=emscripten replaced by build.sh). The run (silinx_exec, the module silinx_jspi) is a
# promising export, silinx_jspi.wait()'s import a suspending one.
CFLAGS += -fwasm-exceptions -sSUPPORT_LONGJMP=wasm
JSFLAGS += -s ALLOW_MEMORY_GROWTH
JSFLAGS += -fwasm-exceptions -s JSPI -s JSPI_EXPORTS=silinx_exec
EXPORTED_FUNCTIONS_EXTRA += ,_silinx_exec

FROZEN_MANIFEST ?= $(TOP)/ports/webassembly/variants/pyscript/manifest.py

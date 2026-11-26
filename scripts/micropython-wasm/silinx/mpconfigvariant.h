// Silinx's variant of MicroPython's webassembly port (#5658, scripts/micropython-wasm/build.sh): the pyscript variant's
// configuration, with sys.settrace (each line of an ESP32 node's program a time, core/esp32-python.js).
#define MICROPY_CONFIG_ROM_LEVEL                (MICROPY_CONFIG_ROM_LEVEL_FULL_FEATURES)
#define MICROPY_GC_SPLIT_HEAP                   (1)
#define MICROPY_GC_SPLIT_HEAP_AUTO              (1)
#define MICROPY_PY_WEAKREF                      (1)
#define MICROPY_PY_SYS_SETTRACE                 (1)

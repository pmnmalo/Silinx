// Silinx - an ESP32 node's MicroPython modules (#5495, docs/SYSTEMS.md, The ESP32): `machine` (Pin, UART) and `time` of
// Silinx's own, behavioural, over the bridge `_silinx` (core/esp32-engine.js: the node's virtual time, its pins, its
// UARTs), put into sys.modules before the program runs; and the trace that gives each line of the program its time. The
// same program runs on a real ESP32 with MicroPython's own modules. Only the program's own lines are timed (its frames',
// `<string>`: exec's), not these modules'.
//
// Isomorphic ES module, no DOM, no imports.

/** The time a line of Python takes on the node (ps): 1 µs, a behavioural ESP32's (said in its fidelity notes). */
export const LINE_PS = 1e6;

const MODULES = `import sys, _silinx
class _SilinxModule:
    pass
def _module(name, **names):
    m = _SilinxModule()
    for k in names:
        setattr(m, k, names[k])
    sys.modules[name] = m
    return m
def _bytes(a):
    # (a JavaScript array: a list in MicroPython's npm build, a JsProxy in Silinx's own, #5658)
    return bytes(a if isinstance(a, (list, tuple)) else [a[i] for i in range(a.length)])
class Pin:
    IN = 1
    OUT = 3
    OPEN_DRAIN = 7
    PULL_UP = 2
    PULL_DOWN = 1
    IRQ_RISING = 1
    IRQ_FALLING = 2
    def __init__(self, id, mode=-1, pull=-1, value=None):
        self.id = id
        self.init(mode, pull, value)
    def init(self, mode=-1, pull=-1, value=None):
        if mode != -1 or pull != -1:
            _silinx.pin_mode(self.id, mode, pull)
        if value is not None:
            self.value(value)
    def value(self, v=None):
        if v is None:
            return _silinx.pin_get(self.id)
        _silinx.pin_set(self.id, 1 if v else 0)
    def __call__(self, v=None):
        return self.value(v)
    def on(self):
        self.value(1)
    def off(self):
        self.value(0)
    def irq(self, *args, **kw):
        raise NotImplementedError("Pin.irq: no interrupts in Silinx's behavioural ESP32")
class UART:
    def __init__(self, id, baudrate=115200, bits=8, parity=None, stop=1, tx=None, rx=None, **kw):
        self.id = id
        self.init(baudrate, bits, parity, stop, tx=tx, rx=rx)
    def init(self, baudrate=115200, bits=8, parity=None, stop=1, tx=None, rx=None, **kw):
        _silinx.uart_init(self.id, baudrate, bits, -1 if parity is None else parity, stop, -1 if tx is None else (tx.id if isinstance(tx, Pin) else tx), -1 if rx is None else (rx.id if isinstance(rx, Pin) else rx))
    def write(self, buf):
        b = buf.encode() if isinstance(buf, str) else bytes(buf)
        _silinx.uart_write(self.id, list(b))
        return len(b)
    def any(self):
        return _silinx.uart_any(self.id)
    def read(self, n=-1):
        got = _bytes(_silinx.uart_read(self.id, n))
        return got if len(got) else None
    def readline(self):
        got = _bytes(_silinx.uart_readline(self.id))
        return got if len(got) else None
def _sleep_us(us):
    if _silinx.sleep_us(us):
        _wait()
_module("machine", Pin=Pin, UART=UART, freq=lambda *a: 240000000, unique_id=lambda: b"silinx", reset=lambda: None)
_t = _module("time", sleep=lambda s: _sleep_us(int(s * 1000000)), sleep_ms=lambda ms: _sleep_us(int(ms) * 1000), sleep_us=_sleep_us,
    ticks_us=lambda: _silinx.ticks_us(), ticks_ms=lambda: _silinx.ticks_us() // 1000, ticks_cpu=lambda: _silinx.ticks_us(),
    ticks_diff=lambda a, b: a - b, ticks_add=lambda a, b: a + b, time=lambda: _silinx.ticks_us() // 1000000, time_ns=lambda: _silinx.ticks_us() * 1000)
sys.modules["utime"] = _t
def _trace(frame, event, arg):
    if frame.f_code.co_filename != "<string>":
        return None
    if event == "line" and _silinx.line():
        _wait()
    return _trace
`;

// how the program waits for the scheduler once its time reached the target (_silinx.line() and sleep_us() say so): the
// Worker's blocking call, or JSPI's suspending one (#5658)
const WAITS = { worker: '_wait = _silinx.pause\n', jspi: 'import silinx_jspi\n_wait = silinx_jspi.wait\n' };

/** The Python run before the program: the modules, and the program itself run traced (`exec`'s frame: a line, a time);
 *  `backend` how it waits ('worker', 'jspi'). */
export const esp32Prelude = (program, backend = 'worker') => `${MODULES}${WAITS[backend]}sys.settrace(_trace)
try:
    exec(${JSON.stringify(String(program))}, {"__name__": "__main__"})
finally:
    sys.settrace(None)
`;

// Silinx - an ESP32 node's MicroPython modules (#5495, docs/SYSTEMS.md, The ESP32): `machine` (Pin, UART, Timer, PWM,
// ADC, SPI, SoftSPI, I2C, SoftI2C) and `time` of Silinx's own, behavioural, over the bridge `_silinx`
// (core/esp32-engine.js: the node's virtual time, its pins, its UARTs, its buses: core/esp32-buses.js), put into
// sys.modules before the program runs; and the trace that gives each line of the program its time. The same program
// runs on a real ESP32 with MicroPython's own modules. Only the program's own lines are timed (its frames', `<string>`:
// exec's), not these modules'. A Timer's callback runs between two lines of the program once its time has come (and
// during a sleep at its time), its own lines not timed (the trace's callback runs it); a bus step (an SPI transfer, an
// I²C byte) waits for its end, its result read by the node from the other end's levels.
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
_pid = lambda p: p.id if isinstance(p, Pin) else p
_timers = []
_busy = [False]
def _next():
    n = None
    for x in _timers:
        if n is None or x[0] < n:
            n = x[0]
    return n
def _due():
    # (the Timers whose time has come, their callbacks one at a time, in their times' order)
    if _busy[0] or not _timers:
        return
    _busy[0] = True
    try:
        while _timers:
            t = _timers[0]
            for x in _timers:
                if x[0] < t[0]:
                    t = x
            if t[0] > _silinx.now_us():
                break
            if t[1]:
                t[0] += t[1]
            else:
                _timers.remove(t)
            t[2](t[3])
    finally:
        _busy[0] = False
def _sleep_us(us):
    end = _silinx.now_us() + us
    while True:
        n = None if _busy[0] else _next()
        if n is None or n >= end:
            break
        if _silinx.sleep_us(n - _silinx.now_us()):
            _wait()
        _due()
    if _silinx.sleep_us(end - _silinx.now_us()):
        _wait()
class Timer:
    ONE_SHOT = 0
    PERIODIC = 1
    def __init__(self, id=-1, **kw):
        self.id = id
        self._t = None
        if kw:
            self.init(**kw)
    def init(self, mode=1, period=-1, freq=-1, callback=None, tick_hz=1000):
        self.deinit()
        us = 1000000 / freq if freq > 0 else period * 1000000 / tick_hz if period >= 0 else 1000000
        self._t = [_silinx.now_us() + us, us if mode == Timer.PERIODIC else 0, callback, self]
        if callback:
            _timers.append(self._t)
    def deinit(self):
        for i in range(len(_timers)):
            if _timers[i] is self._t:
                del _timers[i]
                break
        self._t = None
class PWM:
    def __init__(self, dest, freq=5000, duty=None, duty_u16=None, duty_ns=None, **kw):
        self._pin = _pid(dest)
        self._f = 0
        self._d = 32768
        self.init(freq, duty, duty_u16, duty_ns)
    def init(self, freq=None, duty=None, duty_u16=None, duty_ns=None, **kw):
        if freq is not None:
            if not 1 <= freq <= 40000000:
                raise ValueError("frequency must be from 1Hz to 40MHz")
            self._f = int(freq)
        if duty is not None:
            self._d = int(duty) * 65535 // 1023
        if duty_u16 is not None:
            self._d = int(duty_u16)
        if duty_ns is not None:
            self._d = int(duty_ns) * self._f * 65535 // 1000000000
        self._d = max(0, min(65535, self._d))
        _silinx.pwm(self._pin, self._f, self._d)
    def deinit(self):
        self._f = 0
        _silinx.pwm(self._pin, 0, 0)
    def freq(self, f=None):
        if f is None:
            return self._f
        self.init(freq=f)
    def duty(self, d=None):
        if d is None:
            return self._d * 1023 // 65535
        self.init(duty=d)
    def duty_u16(self, d=None):
        if d is None:
            return self._d
        self.init(duty_u16=d)
    def duty_ns(self, d=None):
        if d is None:
            return self._d * 1000000000 // (65535 * self._f) if self._f else 0
        self.init(duty_ns=d)
class ADC:
    ATTN_0DB = 0
    ATTN_2_5DB = 1
    ATTN_6DB = 2
    ATTN_11DB = 3
    WIDTH_9BIT = 9
    WIDTH_10BIT = 10
    WIDTH_11BIT = 11
    WIDTH_12BIT = 12
    def __init__(self, pin, atten=None, **kw):
        self._pin = _pid(pin)
        if self._pin not in (0, 2, 4, 12, 13, 14, 15, 25, 26, 27, 32, 33, 34, 35, 36, 39):
            raise ValueError("invalid Pin for ADC")
        self._bits = 12
        self._atten = 0 if atten is None else atten
    def atten(self, a):
        self._atten = a
    def width(self, w):
        self._bits = w
    def read_u16(self):
        return 65535 if _silinx.adc(self._pin) else 0
    def read(self):
        return (1 << self._bits) - 1 if _silinx.adc(self._pin) else 0
    def read_uv(self):
        return (950000, 1250000, 1750000, 2450000)[self._atten] if _silinx.adc(self._pin) else 0
def _bus(key):
    # (a bus step's end waited for, then its result, the node's)
    if _silinx.bus_wait():
        _wait()
    while not _silinx.bus_ready(key):
        _silinx.hold()
        _wait()
    return _silinx.bus_take(key)
_soft = [100]
class SPI:
    MSB = 0
    LSB = 1
    _PINS = {1: (14, 13, 12), 2: (18, 23, 19)}
    def __init__(self, id, baudrate=500000, polarity=0, phase=0, bits=8, firstbit=0, sck=None, mosi=None, miso=None, **kw):
        if id not in SPI._PINS and id != -1:
            raise ValueError("SPI(%d) doesn't exist" % id)
        self.id = id
        if id == -1:
            self._key = _soft[0]
            _soft[0] += 1
        else:
            self._key = id
        self.init(baudrate, polarity, phase, bits, firstbit, sck, mosi, miso)
    def init(self, baudrate=500000, polarity=0, phase=0, bits=8, firstbit=0, sck=None, mosi=None, miso=None, **kw):
        d = SPI._PINS.get(self.id, (None, None, None))
        pins = [d[i] if x is None else _pid(x) for i, x in enumerate((sck, mosi, miso))]
        if None in pins:
            raise ValueError("SoftSPI needs its sck, mosi and miso")
        if not 1 <= bits <= 8:
            raise ValueError("bits must be from 1 to 8")
        _silinx.spi_init(self._key, pins[0], pins[1], pins[2], baudrate, polarity, phase, bits, firstbit)
    def deinit(self):
        pass
    def _xfer(self, data):
        _silinx.spi_xfer(self._key, list(data))
        return _bytes(_bus("spi%d" % self._key))
    def write(self, buf):
        self._xfer(bytes(buf))
    def read(self, n, write=0):
        return self._xfer(bytes([write]) * n)
    def readinto(self, buf, write=0):
        got = self._xfer(bytes([write]) * len(buf))
        for i in range(len(buf)):
            buf[i] = got[i]
    def write_readinto(self, wbuf, rbuf):
        got = self._xfer(bytes(wbuf))
        for i in range(len(rbuf)):
            rbuf[i] = got[i]
class SoftSPI(SPI):
    def __init__(self, baudrate=500000, polarity=0, phase=0, bits=8, firstbit=0, sck=None, mosi=None, miso=None, **kw):
        SPI.__init__(self, -1, baudrate, polarity, phase, bits, firstbit, sck, mosi, miso)
def _mem(memaddr, addrsize):
    return bytes([(memaddr >> s) & 0xff for s in range(addrsize - 8, -1, -8)])
class I2C:
    _PINS = {0: (18, 19), 1: (25, 26)}
    def __init__(self, id=-1, scl=None, sda=None, freq=400000, **kw):
        if id not in I2C._PINS and id != -1:
            raise ValueError("I2C(%d) doesn't exist" % id)
        self.id = id
        if id == -1:
            self._key = _soft[0]
            _soft[0] += 1
        else:
            self._key = id
        self.init(scl, sda, freq)
    def init(self, scl=None, sda=None, freq=400000, **kw):
        d = I2C._PINS.get(self.id, (None, None))
        pins = [d[i] if x is None else _pid(x) for i, x in enumerate((scl, sda))]
        if None in pins:
            raise ValueError("SoftI2C needs its scl and sda")
        _silinx.i2c_init(self._key, pins[0], pins[1], freq)
    def deinit(self):
        pass
    def _op(self, op, arg=0):
        _silinx.i2c_op(self._key, op, arg)
        if op in ("write", "read"):
            return _bus("i2c%d" % self._key)
        if _silinx.bus_wait():
            _wait()
    def start(self):
        self._op("start")
    def stop(self):
        self._op("stop")
    def write(self, buf):
        n = 0
        for b in buf:
            if not self._op("write", b):
                break
            n += 1
        return n
    def readinto(self, buf, nack=True):
        for i in range(len(buf)):
            buf[i] = self._op("read", 0 if nack and i == len(buf) - 1 else 1)
    def _address(self, addr, read):
        self.start()
        if not self._op("write", (addr << 1) | read):
            self.stop()
            raise OSError(19)
    def writeto(self, addr, buf, stop=True):
        self._address(addr, 0)
        n = self.write(buf)
        if stop:
            self.stop()
        return n
    def writevto(self, addr, vector, stop=True):
        return self.writeto(addr, b"".join([bytes(x) for x in vector]), stop)
    def readfrom_into(self, addr, buf, stop=True):
        self._address(addr, 1)
        self.readinto(buf)
        if stop:
            self.stop()
    def readfrom(self, addr, nbytes, stop=True):
        b = bytearray(nbytes)
        self.readfrom_into(addr, b, stop)
        return bytes(b)
    def writeto_mem(self, addr, memaddr, buf, addrsize=8):
        self.writeto(addr, _mem(memaddr, addrsize) + bytes(buf))
    def readfrom_mem_into(self, addr, memaddr, buf, addrsize=8):
        self.writeto(addr, _mem(memaddr, addrsize), False)
        self.readfrom_into(addr, buf)
    def readfrom_mem(self, addr, memaddr, nbytes, addrsize=8):
        b = bytearray(nbytes)
        self.readfrom_mem_into(addr, memaddr, b, addrsize)
        return bytes(b)
    def scan(self):
        found = []
        for a in range(0x08, 0x78):
            self.start()
            ok = self._op("write", a << 1)
            self.stop()
            if ok:
                found.append(a)
        return found
class SoftI2C(I2C):
    def __init__(self, scl, sda, freq=400000, **kw):
        I2C.__init__(self, -1, scl, sda, freq)
_module("machine", Pin=Pin, UART=UART, Timer=Timer, PWM=PWM, ADC=ADC, SPI=SPI, SoftSPI=SoftSPI, I2C=I2C, SoftI2C=SoftI2C,
    freq=lambda *a: 240000000, unique_id=lambda: b"silinx", reset=lambda: None)
_t = _module("time", sleep=lambda s: _sleep_us(int(s * 1000000)), sleep_ms=lambda ms: _sleep_us(int(ms) * 1000), sleep_us=_sleep_us,
    ticks_us=lambda: _silinx.ticks_us(), ticks_ms=lambda: _silinx.ticks_us() // 1000, ticks_cpu=lambda: _silinx.ticks_us(),
    ticks_diff=lambda a, b: a - b, ticks_add=lambda a, b: a + b, time=lambda: _silinx.ticks_us() // 1000000, time_ns=lambda: _silinx.ticks_us() * 1000)
sys.modules["utime"] = _t
_seen = [0]
def _trace(frame, event, arg):
    if frame.f_code.co_filename != "<string>":
        return None
    if event == "line":
        _seen[0] = frame.f_lineno
        if _silinx.line():
            _wait()
        if _timers:
            _due()
    return _trace
def _silinx_loop(n, c):
    if _seen[0] == n:
        _seen[0] = 0
    else:
        if _silinx.line():
            _wait()
        if _timers:
            _due()
    return c
import builtins
builtins._silinx_loop = _silinx_loop
`;

// (a string's end: its quotes, single or triple, its escapes; i its opening quote)
function stringEnd(s, i) {
  const q = s[i], triple = s.startsWith(q.repeat(3), i), close = triple ? q.repeat(3) : q;
  for (let j = i + close.length; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s.startsWith(close, j)) return j + close.length;
    else if (!triple && s[j] === '\n') return j;
  }
  return s.length;
}

/** A program's `while` loops each a line's time a check of their condition (#5751): MicroPython's trace says a line only
 *  when the line changes, and a loop's check carries its body's last line, so a loop whose body is one line (`while not
 *  u.any(): pass`) took no time and never handed back to the scheduler. Each header `while C:` becomes `while
 *  _silinx_loop(N, (C)):`, N its line (its first check that line's own, every other a line's time, as CPython's trace
 *  says the header each time); on the same lines, the program's lines and errors unchanged. */
export function timeWhileLoops(program) {
  const s = String(program);
  let out = '', i = 0, line = 1, depth = 0, start = true, header = 0;
  while (i < s.length) {
    const c = s[i];
    if (start && depth === 0 && !header) {
      const m = /^[ \t]*while(?=[\s(\\])/.exec(s.slice(i, i + 200));
      if (m) { out += `${m[0]} _silinx_loop(${line}, (`; i += m[0].length; header = 1; start = false; continue; }
      if (!/[ \t\r\n]/.test(c)) start = false;
    }
    // (a string, a comment: as they are)
    const end = c === '"' || c === "'" ? stringEnd(s, i) : c === '#' ? (s.indexOf('\n', i) + 1 || s.length + 1) - 1 : i;
    if (end > i) { const t = s.slice(i, end); line += t.split('\n').length - 1; out += t; i = end; continue; }
    if (c === '\\' && s[i + 1] === '\n') { out += '\\\n'; i += 2; line++; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
    else if (c === '\n') { line++; if (depth === 0) start = true; }
    else if (c === ':' && header && depth === 0 && s[i + 1] !== '=') { out += ')):'; i++; header = 0; continue; }
    out += c;
    i++;
  }
  return out;
}

// how the program waits for the scheduler once its time reached the target (_silinx.line() and sleep_us() say so): the
// Worker's blocking call, or JSPI's suspending one (#5658)
const WAITS = { worker: '_wait = _silinx.pause\n', jspi: 'import silinx_jspi\n_wait = silinx_jspi.wait\n' };

/** The Python run before the program: the modules, and the program itself run traced (`exec`'s frame: a line, a time;
 *  a `while` loop's check a line too: timeWhileLoops);
 *  `backend` how it waits ('worker', 'jspi'). */
export const esp32Prelude = (program, backend = 'worker') => `${MODULES}${WAITS[backend]}sys.settrace(_trace)
try:
    exec(${JSON.stringify(timeWhileLoops(program))}, {"__name__": "__main__"})
finally:
    sys.settrace(None)
`;

# A mock of MicroPython's machine and time modules for #5487's tests (test/reactive-py.test.js): a generated program
# compiled (py_compile, its warnings errors) and run on the host's Python, its pins and its clock the harness's.
# Copyright 2026 Pedro Maló. AGPL-3.0-only.
#
# python3 -I -W error run.py <program.py> <spec.json>; spec: { tick, outputs: [[name, [GPIO of bit 0, ...]]], inputs: the
# same, vectors: [{ name: value }] }. Each tick's inputs are put on their pins just before the clock reaches it; the
# outputs' pins are printed after it, one line a tick ('0110_1', bit 0 last), as test/reactive-lib.mjs runModel's rows.
# The clock also stops just before each tick (no tick then: the program must wait for its period).
import json
import py_compile
import sys
import types

prog, spec_path = sys.argv[1], sys.argv[2]
py_compile.compile(prog, doraise=True)
with open(spec_path) as f:
    spec = json.load(f)
tick, vectors = spec['tick'], spec['vectors']
level, mode, errors, rows = {}, {}, [], []


class Pin:
    IN = 1
    OUT = 3

    def __init__(self, n, m):
        self.n = n
        mode[n] = m

    def value(self, *v):
        if v:
            if mode.get(self.n) != Pin.OUT:
                errors.append('pin %d written, not an output' % self.n)
            level[self.n] = 1 if v[0] else 0
            return None
        if mode.get(self.n) != Pin.IN:
            errors.append('pin %d read, not an input' % self.n)
        return level.get(self.n, 0)


class Stop(Exception):
    pass


clock = {'times': [0]}
for k in range(1, len(vectors) + 2):
    if tick > 1:
        clock['times'].append(k * tick - 1)
    clock['times'].append(k * tick)


def outputs():
    return '_'.join(''.join(str(level.get(g, 0)) for g in reversed(gpios)) for _, gpios in spec['outputs'])


def ticks_ms():
    t = clock['times'].pop(0)
    if t and t % tick == 0:
        k = t // tick
        if k >= 2:
            rows.append(outputs())
        if k > len(vectors):
            raise Stop()
        for name, gpios in spec['inputs']:
            for b, g in enumerate(gpios):
                level[g] = (vectors[k - 1][name] >> b) & 1
    return t


machine = types.ModuleType('machine')
machine.Pin = Pin
time = types.ModuleType('time')
time.ticks_ms = ticks_ms
time.ticks_diff = lambda a, b: a - b
time.ticks_add = lambda a, b: a + b
sys.modules['machine'] = machine
sys.modules['time'] = time
with open(prog) as f:
    code = compile(f.read(), prog, 'exec')
try:
    exec(code, {'__name__': '__main__'})
except Stop:
    pass
for e in errors:
    print('ERROR: ' + e, file=sys.stderr)
print('\n'.join(rows))
sys.exit(1 if errors else 0)

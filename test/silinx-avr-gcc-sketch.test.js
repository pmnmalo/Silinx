// @silinx/avr-gcc's sketch made C++ (#5934, packages/silinx-avr-gcc/src/sketch.js), as the Arduino builder makes it: the
// functions an .ino defines found (not its declarations, control statements, classes, initialisers, comments or strings),
// a prototype for each one not declared, before the first function, `#line` lines back to each file and line; the main .ino
// first, the others in name order. And the compile and link commands are avr-gcc 7.3.0's (`avr-gcc -###`, src/flags.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sketchCpp, inoFunctions, compileSteps, linkSteps, BOARDS, ARDUINO_CORE } from '../packages/silinx-avr-gcc/src/index.js';

test('#5934 the functions an .ino defines, and the ones it declares', () => {
  const src = [
    '// void commented(int x) { }', '#include <Servo.h>', '#define TWICE(x) ((x) * 2)', 'int count = 0;', 'const char *msg = "f() { }";',
    'int later(int);', 'struct P { int x; };', 'class C {', ' public:', '  void m() {}', '};', '',
    'void setup() {', '  if (count) { count++; }', '}', '', 'unsigned long long big(const char *s, int n = 3)', '{', '  return n;', '}',
    'static inline uint8_t pin(void) { return 13; }', 'P make() { P p = { 1 }; return p; }', 'void loop() { for (;;) {} }', 'int later(int a) { return a; }',
  ].join('\n');
  const { defs, declared } = inoFunctions(src);
  assert.deepEqual(defs.map((d) => [d.proto, d.line]), [
    ['void setup();', 13], ['unsigned long long big(const char *s, int n = 3);', 17], ['static inline uint8_t pin(void);', 21], ['P make();', 22], ['void loop();', 23], ['int later(int a);', 24],
  ]);
  assert.deepEqual([...declared], ['later']);
});

test('#5934 a sketch\'s .ino files as one C++ file: Arduino.h, the prototypes before the first function, #line lines', () => {
  const { cpp, name } = sketchCpp([
    { name: 'blink.ino', text: '// blink\nint led = 13;\n\nvoid setup() { pinMode(led, OUTPUT); }\nvoid loop() { toggle(); delay(500); }\n' },
    { name: 'more.ino', text: 'void toggle() { digitalWrite(13, !digitalRead(13)); }\n' },
  ]);
  assert.equal(name, 'blink.ino.cpp');
  assert.equal(cpp, ['#include <Arduino.h>', '#line 1 "blink.ino"', '// blink', 'int led = 13;', '', '#line 4 "blink.ino"', 'void setup();', '#line 5 "blink.ino"', 'void loop();',
    '#line 1 "more.ino"', 'void toggle();', '#line 4 "blink.ino"', 'void setup() { pinMode(led, OUTPUT); }', 'void loop() { toggle(); delay(500); }', '', '#line 1 "more.ino"',
    'void toggle() { digitalWrite(13, !digitalRead(13)); }', '', ''].join('\n'));
  // no function: as it is; a function declared already: no prototype of its own
  assert.equal(sketchCpp([{ name: 'a.ino', text: 'int x;\n' }]).cpp, '#include <Arduino.h>\n#line 1 "a.ino"\nint x;\n\n');
  assert.equal(sketchCpp([{ name: 'a.ino', text: 'void f();\nvoid setup() { f(); }\nvoid f() {}\n' }]).cpp.match(/^void f\(\);$/gm).length, 1);
  // (a default argument: no prototype, given once in its definition)
  assert.ok(!/^int g\(int a = 1\);$/m.test(sketchCpp([{ name: 'a.ino', text: 'void setup() {}\nint g(int a = 1) { return a; }\n' }]).cpp));
});

test('#5934 the commands: avr-gcc 7.3.0\'s for the Arduino core\'s recipes on the ATmega328P, no LTO', () => {
  assert.equal(ARDUINO_CORE, '1.8.8');
  assert.deepEqual(Object.keys(BOARDS), ['arduino-uno', 'arduino-nano']);
  const [cc, as] = compileSteps('blink.ino.cpp', 'blink.o');
  assert.equal(cc.tool, 'cc1plus');
  for (const f of ['-D__AVR_ATmega328P__', '-DF_CPU=16000000L', '-DARDUINO=10607', '-DARDUINO_AVR_UNO', '-DARDUINO_ARCH_AVR', '-mmcu=avr5', '-Os', '-std=gnu++11', '-fpermissive',
    '-fno-exceptions', '-ffunction-sections', '-fdata-sections', '-fno-threadsafe-statics', '-fno-rtti']) assert.ok(cc.args.includes(f), f);
  assert.ok(!cc.args.some((a) => /lto/.test(a)), 'no LTO');
  assert.deepEqual(as, { tool: 'as', args: ['-mmcu=avr5', '-mno-skip-bug', '-o', 'blink.o', 'blink.s'] });
  assert.equal(compileSteps('x.c', 'x.o')[0].tool, 'cc1');
  assert.ok(compileSteps('x.c', 'x.o')[0].args.includes('-std=gnu11'));
  assert.deepEqual(compileSteps('w.S', 'w.o')[0].args.slice(0, 3), ['-E', '-lang-asm', '-quiet']);
  assert.ok(compileSteps('x.cpp', 'x.o', { board: 'arduino-nano' })[0].args.includes('-DARDUINO_AVR_NANO'));
  const [ld, objcopy] = linkSteps(['a.o'], ['/arduino/lib/core.a']);
  assert.deepEqual(ld.args.slice(-9), ['a.o', '/arduino/lib/core.a', '-lm', '--start-group', '-lgcc', '-lm', '-lc', '-latmega328p', '--end-group']);
  assert.ok(ld.args.includes('--gc-sections') && ld.args.includes('/sysroot/avr/lib/crtatmega328p.o'));
  assert.deepEqual(objcopy.args, ['-O', 'ihex', '-R', '.eeprom', 'sketch.elf', 'sketch.hex']);
});

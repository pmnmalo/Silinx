// The devices of a circuit's live simulation (#5357, moved from core/circuit-sim.js's createCircuitSim as they were):
// the parts whose behaviour is a model of their own, not gates nor a module: a character LCD (#5330), a graphic OLED on
// I²C (#5336), a servo (#5347), a temperature sensor on I²C (#5342), a buzzer (#5454), an ultrasonic range sensor (#5456:
// its echo timed by its own wake-ups). Each set up as its part is read (its nets, its
// drivers), evaluated as a net it reads changes, and seen through the simulation's API (lcds, oleds, servos, sensors…).
// Isomorphic module.
import { createLcd } from './circuit-lcd.js';
import { createI2cPeripheral } from './circuit-i2c.js';
import { createSsd1306 } from './circuit-oled.js';
import { createLm75 } from './circuit-lm75.js';
import { createServo } from './circuit-servo.js';
import { createBuzzer } from './circuit-buzzer.js';
import { createSonar } from './circuit-sonar.js';

/**
 * A device of a part, or null (another part): { ic, reads } (its state, as createCircuitSim's ics; the nets it reads).
 * at(name): its pin's net; addDriver(net, value, strength): a driver of a net; level(net): a net's level now.
 */
export function setupDevice(p, d, { at, addDriver, level }) {
  // (a character LCD, #5330: its controller, a write on E's falling edge while powered)
  if (d.kind === 'lcd') {
    const ic = { part: p, def: d, lcd: createLcd({ cols: d.cols, rows: d.rows }), vcc: at('VDD'), gnd: at('VSS'), e: at('E'), rs: at('RS'),
      bus: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].map(at), was: { e: null, on: false } };
    return { ic, reads: [ic.vcc, ic.gnd, ic.e] };
  }
  // (a graphic OLED, #5336: its I²C peripheral on SCL and SDA, its ACK pulling SDA low, its controller fed each byte)
  if (d.kind === 'oled') {
    const oled = createSsd1306();
    const ic = { part: p, def: d, oled, vcc: at('VCC'), gnd: at('GND'), scl: at('SCL'), sda: at('SDA'), sdaDrv: addDriver(at('SDA'), 'Z'),
      bus: createI2cPeripheral(d.address, { onStart: () => oled.start(), onByte: (b) => oled.write(b) }), was: false };
    return { ic, reads: [ic.vcc, ic.gnd, ic.scl, ic.sda] };
  }
  // (a servo, #5347: its signal's pulses measured, its arm moving)
  if (d.kind === 'servo') {
    const ic = { part: p, def: d, servo: createServo(), vcc: at('VCC'), gnd: at('GND'), sig: at('SIG'), prev: null, was: false };
    return { ic, reads: [ic.vcc, ic.gnd, ic.sig] };
  }
  // (a buzzer, #5454: its +'s edges measured while its − is at 0, its tone)
  if (d.kind === 'buzzer') {
    const ic = { part: p, def: d, buzzer: createBuzzer(), sig: at('+'), ref: at('−'), was: false };
    return { ic, reads: [ic.sig, ic.ref] };
  }
  // (an ultrasonic range sensor, #5456: its trigger read, its echo driven at its own times)
  if (d.kind === 'sonar') {
    const ic = { part: p, def: d, sonar: createSonar({ cm: p.cm }), vcc: at('VCC'), gnd: at('GND'), trig: at('Trig'), echo: addDriver(at('Echo'), 'Z'), was: false };
    return { ic, reads: [ic.vcc, ic.gnd, ic.trig] };
  }
  // (a temperature sensor, #5342: its I²C peripheral at 0x48 + A2..A0, read too; its OS open drain)
  if (d.kind === 'sensor') {
    const lm75 = createLm75({ temp: p.temp });
    const addr = ['A0', 'A1', 'A2'].map(at);
    const ic = { part: p, def: d, lm75, vcc: at('VCC'), gnd: at('GND'), scl: at('SCL'), sda: at('SDA'), sdaDrv: addDriver(at('SDA'), 'Z'), osDrv: addDriver(at('OS'), 'Z'),
      bus: createI2cPeripheral(() => d.address | addr.reduce((v, net, k) => v | (level(net) === '1' ? 1 << k : 0), 0),
        { onStart: (read) => lm75.start(read), onByte: (b) => lm75.write(b), onRead: () => lm75.read() }), was: false };
    return { ic, reads: [ic.vcc, ic.gnd, ic.scl, ic.sda] };
  }
  return null;
}

/** A device evaluated (true), or not one (false). powered(ic), level(net), now() (ns), drive(driver, value), wake(at): the
 *  device evaluated again at its own time (#5456). */
export function evaluateDevice(ic, { powered, level, now, drive, wake }) {
  if (ic.lcd) {   // (its controller reset while unpowered; a write as E falls)
    const on = powered(ic), e = level(ic.e);
    if (!on) ic.lcd.reset();
    else if (ic.was.on && ic.was.e === '1' && e === '0') ic.lcd.write(level(ic.rs) === '1', ic.bus.reduce((v, net, k) => v | (level(net) === '1' ? 1 << k : 0), 0));
    ic.was = { e, on };
    return true;
  }
  if (ic.oled) {   // (its controller and its bus reset while unpowered; its ACK SDA's driver)
    const on = powered(ic);
    if (!on) { if (ic.was) { ic.oled.reset(); ic.bus.reset(); } drive(ic.sdaDrv, 'Z'); }
    else drive(ic.sdaDrv, ic.bus.feed(level(ic.scl), level(ic.sda)) ? '0' : 'Z');
    ic.was = on;
    return true;
  }
  if (ic.servo) {   // (its signal's edges while powered; unpowered: still)
    const on = powered(ic), v = level(ic.sig);
    if (!on) { if (ic.was) ic.servo.stop(now()); } else if (v !== ic.prev) ic.servo.edge(v, now());
    ic.prev = on ? v : null;
    ic.was = on;
    return true;
  }
  if (ic.buzzer) {   // (its + read while its − is at 0; else silent)
    const on = level(ic.ref) === '0';
    if (!on) { if (ic.was) ic.buzzer.stop(now()); } else ic.buzzer.edge(level(ic.sig) === '1' ? '1' : '0', now());
    ic.was = on;
    return true;
  }
  if (ic.sonar) {   // (its echo low while powered, its trigger's fall a measure, its wake-ups the echo's start and end)
    const on = powered(ic), t = now();
    if (!on) { if (ic.was) ic.sonar.reset(); drive(ic.echo, 'Z'); ic.was = false; return true; }
    if (!ic.was) drive(ic.echo, '0');
    ic.was = true;
    const w = ic.sonar.wake(t);
    if (w.echo) drive(ic.echo, w.echo);
    if (w.echo && w.next != null) wake(w.next);
    const at = ic.sonar.trig(level(ic.trig) === '1' ? '1' : '0', t);
    if (at != null) wake(at);
    return true;
  }
  if (ic.lm75) {   // (its registers and its bus reset while unpowered; SDA's and OS's drivers)
    const on = powered(ic);
    if (!on) { if (ic.was) { ic.lm75.reset(); ic.bus.reset(); } drive(ic.sdaDrv, 'Z'); drive(ic.osDrv, 'Z'); }
    else { drive(ic.sdaDrv, ic.bus.feed(level(ic.scl), level(ic.sda)) ? '0' : 'Z'); drive(ic.osDrv, ic.lm75.osLow() ? '0' : 'Z'); }
    ic.was = on;
    return true;
  }
  return false;
}

/** The devices as the simulation's API shows them. now() (ns); evaluate(ic) and update(): the simulation's. */
export function deviceViews(ics, { now, evaluate, update }) {
  return {
    /** each character LCD's display: { on, lines, cursor, blink } (#5330) */
    lcds: () => Object.fromEntries(ics.filter((x) => x.lcd).map((x) => [x.part.id, x.lcd.state()])),
    /** each graphic OLED's display: { on, lit, pages, rows } (#5336) */
    oleds: () => Object.fromEntries(ics.filter((x) => x.oled).map((x) => [x.part.id, x.oled.state()])),
    /** each servo's state now: { angle, target, width, period } (#5347), and what it said (once each) */
    servos: () => Object.fromEntries(ics.filter((x) => x.servo).map((x) => [x.part.id, x.servo.state(now())])),
    servoWarnings: () => ics.filter((x) => x.servo || x.buzzer || x.sonar).flatMap((x) => (x.servo || x.buzzer || x.sonar).warnings.map((w) => `${x.part.id}: ${w.text}`)),
    /** each buzzer's state now: { sounding, hz, how } (#5454) */
    buzzers: () => Object.fromEntries(ics.filter((x) => x.buzzer).map((x) => [x.part.id, x.buzzer.state(now())])),
    /** each ultrasonic range sensor's state: { cm, measuring, echo (its last, µs) } (#5456) */
    sonars: () => Object.fromEntries(ics.filter((x) => x.sonar).map((x) => [x.part.id, x.sonar.state()])),
    /** a part's sensed value now (#5456: its `sense`'s `prop`) */
    sensed(id, prop) {
      const ic = ics.find((x) => x.part.id === id && x.def.sense?.some((s) => s.prop === prop));
      if (!ic) throw new Error(`${id} senses no ${prop} in the circuit`);
      return ic.sonar.cm;
    },
    /** a part's sensed value set now (#5456: a part's `sense`, its `prop`): an ultrasonic sensor's distance */
    setSensed(id, prop, v) {
      const ic = ics.find((x) => x.part.id === id && x.def.sense?.some((s) => s.prop === prop));
      if (!ic) throw new Error(`${id} senses no ${prop} in the circuit`);
      const s = ic.def.sense.find((x) => x.prop === prop), n = Number(v);
      if (!Number.isFinite(n) || n < s.min || n > s.max) throw new Error(`${id}'s ${prop}: from ${s.min} to ${s.max} ${s.unit}`);
      if (ic.sonar) ic.sonar.cm = n;
      update();
    },
    /** each temperature sensor's state: { temp, raw, conf, thyst, tos, os, pointer } (#5342) */
    sensors: () => Object.fromEntries(ics.filter((x) => x.lm75).map((x) => [x.part.id, x.lm75.state()])),
    /** a temperature sensor's temperature set now (°C): a conversion, its OS as it gives */
    setTemp(id, t) {
      const ic = ics.find((x) => x.lm75 && x.part.id === id);
      if (!ic) throw new Error(`${id} is not a temperature sensor of the circuit`);
      ic.lm75.setTemp(Number(t));
      evaluate(ic);
      update();
    },
  };
}

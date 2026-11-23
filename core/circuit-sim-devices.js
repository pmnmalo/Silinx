// The devices of a circuit's live simulation (#5357, moved from core/circuit-sim.js's createCircuitSim as they were):
// the parts whose behaviour is a model of their own, not gates nor a module: a character LCD (#5330), a graphic OLED on
// I²C (#5336), a servo (#5347), a temperature sensor on I²C (#5342). Each set up as its part is read (its nets, its
// drivers), evaluated as a net it reads changes, and seen through the simulation's API (lcds, oleds, servos, sensors…).
// Isomorphic module.
import { createLcd } from './circuit-lcd.js';
import { createI2cPeripheral } from './circuit-i2c.js';
import { createSsd1306 } from './circuit-oled.js';
import { createLm75 } from './circuit-lm75.js';
import { createServo } from './circuit-servo.js';

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

/** A device evaluated (true), or not one (false). powered(ic), level(net), now() (ns), drive(driver, value). */
export function evaluateDevice(ic, { powered, level, now, drive }) {
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
    servoWarnings: () => ics.filter((x) => x.servo).flatMap((x) => x.servo.warnings.map((w) => `${x.part.id}: ${w.text}`)),
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

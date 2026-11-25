// silinx-pic24 - the external interrupts INT0 to INT4 (#5481, DS30010074 section 8): INT0 on its fixed pin (RD0), INT1
// to INT4 on the pins PPS maps them to (RPINR0-2); an edge of their pin's level as INTCON2's INTxEP selects (0 the rising
// one, 1 the falling one) sets their flag (INT0 IRQ 0, INT1 20, INT2 29, INT3 53, INT4 54).

const INTCON2 = 0x0082;
const IRQS = [0, 20, 29, 53, 54];

export class ExternalInterrupts {
  constructor(mcu, ports, pps) {
    Object.assign(this, { mcu, ports, pps });
    ports.onLevel((pin, level) => { if (pin === 'RD0') this.edge(0, level); });
    for (let n = 1; n <= 4; n++) pps.watch(`INT${n}`, (level) => this.edge(n, level));
  }

  edge(n, level) {
    if (level == null) return;
    const falling = (this.mcu.get(INTCON2) >> n) & 1;
    if (level === (falling ? 0 : 1)) this.mcu.cpu.raise(IRQS[n]);
  }
}

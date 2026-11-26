In short:

- **A function generator, a comparator, the Pmod DA2 and AD1 in the circuits:** a PWM through an RC as a simple DAC, an
  LED dimmed by a PWM, a sine squared by a comparator, an R-2R ladder, Digilent's 12-bit DAC and ADC Pmods on SPI as
  their chips work.

In detail:

- **PWM with an RC filter, a comparator, the Pmod DA2 and AD1 (part of #5384, #5387):** core/circuit-analog-devices.js,
  a function generator (a square wave with its duty cycle, a sine, a triangle; through 50 Ω, its COM earthed; its duty
  cycle turned while running) and an LM393 (its outputs open collector, its inputs' crossings found within a millivolt);
  core/circuit-pmod.js, the DAC121S101 and AD7476A as their datasheets' SPI (16 bits, MSB first, on the clock's falling
  edges; a word cut short aborted; the power-down modes; 4 leading zeros, released after the 16th edge), the Pmod DA2
  and AD1 as parts (J1 and J2), their VCC their reference. The analog side steps on a square wave's edges, a sine's
  fiftieth of a period; the LEDs' mean current over a frame (a PWM's dimming). Drawn (web/js/circuit-draw-bench.js), the
  Analog group, their Properties (a choice: the wave), Portuguese. MCP: edit_circuit's set (hz, vhigh, vlow, duty, wave),
  simulate_drawing's duty cycle, circuit_parts' choices and settings. Tests: circuit-pmod (the frames written and read
  bit by bit; a word sent by switches measured on VOUTA; a potentiometer read by the AD1; a PWM through an RC, its mean
  and its ripple against the steady state's closed form; an R-2R ladder's eight codes; an LM393's duty cycle against
  ½ + asin(½)/π), mcp-circuit; the UI's circuit-pwm in both interfaces and Portuguese, the Parts panel's counts.

In short:

- Co-design: the **regs-avr** example, a register map in use (an Arduino writes the FPGA's PWM duty and reads its
  millisecond counter over SPI); Try it says each SPI and I²C link's transfers and the register accesses in the
  console when a run stops.

In detail:

- The regs-avr example (examples/regs-avr: the map pwm_regs.regs.json and its slave, the FPGA's pwm_top.vhd instancing
  it, a PWM on LD0 and a millisecond counter, and the Arduino's firmware/regs.asm), listed after i2c-avr; a link's
  register accesses found when the FPGA node's module instances a map's slave (core/regmap.js hierModules, regmapFor of
  the node's hierarchy); Try it's console says each SPI and I²C link's transfers and the accesses when a run stops (the
  MCP's simulate's lines); the user's guide (EN, PT), docs/CODESIGN.md (Fixes #5288).

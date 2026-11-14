// The entity of an IC in the HDL generated from a circuit (#3897, #3899, core/circuit-hdl.js): its pins its ports (its
// not-connected pins left out), its gates with their delay (inertial, as core/circuit-sim.js's), its inputs read as the
// real chip reads them (a floating 74LS input high, a 4000's X), an open collector output a 0 or nothing, nothing driven
// while unpowered. VHDL and Verilog. Isomorphic module.

/** A pin's port name: 1A → a1, 2Y → y2, A → a, VCC → vcc, VDD → vdd. */
export const pinPort = (p) => p.port ?? (/^\d/.test(p.name) ? `${p.name.slice(1).toLowerCase()}${p.name[0]}` : p.name.toLowerCase());
/** An IC's pins that are its entity's ports (not its NC ones). */
export const icPorts = (d) => d.pins.filter((p) => p.dir !== 'nc');

// (VHDL's nand and nor do not chain: not (a and b and c))
const GATE_V = { nand: (x) => (x.length > 2 ? `(not (${x.join(' and ')}))` : `(${x.join(' nand ')})`), and: (x) => `(${x.join(' and ')})`, or: (x) => `(${x.join(' or ')})`, nor: (x) => (x.length > 2 ? `(not (${x.join(' or ')}))` : `(${x.join(' nor ')})`), xor: (x) => `(${x.join(' xor ')})`, not: (x) => `(not ${x[0]})` };
const GATE_VL = { nand: (x) => `~(${x.join(' & ')})`, and: (x) => `(${x.join(' & ')})`, or: (x) => `(${x.join(' | ')})`, nor: (x) => `~(${x.join(' | ')})`, xor: (x) => `(${x.join(' ^ ')})`, not: (x) => `~${x[0]}` };
const isOut = (p) => p.dir === 'out' || p.dir === 'oc';

/** An IC's entity in VHDL, its lines pushed on L. */
export function vhdlIc(L, name, d) {
  if (d.model || d.seq) return vhdlMsi(L, name, d);
  const pin = new Map(d.pins.map((p) => [p.n, p]));
  const vcc = pinPort(d.pins.find((p) => p.dir === 'vcc')), gnd = pinPort(d.pins.find((p) => p.dir === 'gnd'));
  L.push('library ieee;', 'use ieee.std_logic_1164.all;', '', `-- ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, `entity ${name} is`, '  port (');
  L.push(icPorts(d).map((p) => `    ${pinPort(p)} : ${isOut(p) ? "out std_logic := 'X'" : 'in std_logic'}`).join(';\n'), '  );', `end entity ${name};`, '');
  L.push(`architecture model of ${name} is`);
  if (d.family === 'ttl') {
    L.push('  -- a 74LS input reads a floating (Z) level high', '  function rd(s : std_logic) return std_logic is', '  begin', '    case s is', "      when '0' | 'L' => return '0';",
      "      when '1' | 'H' | 'Z' => return '1';", "      when others => return 'X';", '    end case;', '  end function rd;');
  } else L.push('  -- a CMOS input reads a floating (Z) level unknown (X)', '  function rd(s : std_logic) return std_logic is', '  begin', '    return to_x01(s);', '  end function rd;');
  if (d.oc) L.push('  -- an open collector output: a 0, or nothing', '  function oc(s : std_logic) return std_logic is', '  begin', "    if s = '0' then return '0'; elsif s = '1' then return 'Z'; else return 'X'; end if;", '  end function oc;');
  L.push('  signal pw : boolean;', 'begin', `  pw <= ${vcc} = '1' and ${gnd} = '0';`);
  for (const g of d.gates) {
    const e = GATE_V[g.fn](g.ins.map((n) => `rd(${pinPort(pin.get(n))})`));
    L.push(`  ${pinPort(pin.get(g.out))} <= ${d.oc ? `oc${e}` : e} after ${d.tpd} ns when pw else 'Z' after ${d.tpd} ns;`);
  }
  L.push('end architecture model;', '');
}

/** An IC's module in Verilog, its lines pushed on L. */
export function verilogIc(L, name, d) {
  if (d.model || d.seq) return verilogMsi(L, name, d);
  const pin = new Map(d.pins.map((p) => [p.n, p]));
  const vcc = pinPort(d.pins.find((p) => p.dir === 'vcc')), gnd = pinPort(d.pins.find((p) => p.dir === 'gnd'));
  L.push(`// ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, `module ${name} (${icPorts(d).map((p) => `${isOut(p) ? 'output' : 'input'} ${pinPort(p)}`).join(', ')});`);
  if (d.family === 'ttl') L.push('  // a 74LS input reads a floating (z) level high', '  function rd(input s);', "    rd = (s === 1'bz) ? 1'b1 : s;", '  endfunction');
  else L.push('  // a CMOS input reads a floating (z) level unknown (x)', '  function rd(input s);', "    rd = (s === 1'bz) ? 1'bx : s;", '  endfunction');
  if (d.oc) L.push('  // an open collector output: a 0, or nothing', '  function oc(input s);', "    oc = (s === 1'b0) ? 1'b0 : (s === 1'b1) ? 1'bz : 1'bx;", '  endfunction');
  L.push(`  wire pw = (${vcc} === 1'b1) && (${gnd} === 1'b0);`);
  for (const g of d.gates) {
    const e = GATE_VL[g.fn](g.ins.map((n) => `rd(${pinPort(pin.get(n))})`));
    L.push(`  assign #${d.tpd} ${pinPort(pin.get(g.out))} = pw ? ${d.oc ? `oc(${e})` : e} : 1'bz;`);
  }
  L.push('endmodule', '');
}

// ------------------------------------------------------------------ an MSI IC (core/circuit-msi.js)
// its inputs read (rd) into i_<port>, an X among them making every output X, else its body (the IC's own, its outputs
// o_<port>); each output driven after its delay while powered (an open collector one: a 0 or nothing)
const CMOS_RD = ['  -- a CMOS input reads a floating (Z) level unknown (X)', '  function rd(s : std_logic) return std_logic is', '  begin', '    return to_x01(s);', '  end function rd;'];
const TTL_RD = ['  -- a 74LS input reads a floating (Z) level high', '  function rd(s : std_logic) return std_logic is', '  begin', '    case s is', "      when '0' | 'L' => return '0';",
  "      when '1' | 'H' | 'Z' => return '1';", "      when others => return 'X';", '    end case;', '  end function rd;'];
function vhdlMsi(L, name, d) {
  const ins = d.pins.filter((p) => p.dir === 'in'), outs = d.pins.filter(isOut);
  const vcc = pinPort(d.pins.find((p) => p.dir === 'vcc')), gnd = pinPort(d.pins.find((p) => p.dir === 'gnd'));
  L.push('library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '', `-- ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, `entity ${name} is`, '  port (');
  L.push(icPorts(d).map((p) => `    ${pinPort(p)} : ${isOut(p) ? "out std_logic := 'X'" : 'in std_logic'}`).join(';\n'), '  );', `end entity ${name};`, '');
  L.push(`architecture model of ${name} is`, ...(d.family === 'cmos' ? CMOS_RD : TTL_RD), '  -- whether a level is unknown', '  function anyx(v : std_logic_vector) return boolean is', '  begin', '    for k in v\'range loop',
    "      if v(k) /= '0' and v(k) /= '1' then return true; end if;", '    end loop;', '    return false;', '  end function anyx;');
  if (outs.some((p) => p.dir === 'oc')) L.push('  -- an open collector output: a 0, or nothing', '  function oc(s : std_logic) return std_logic is', '  begin', "    if s = '0' then return '0'; elsif s = '1' then return 'Z'; else return 'X'; end if;", '  end function oc;');
  if (d.seq) return vhdlSeq(L, d, ins, outs, vcc, gnd);
  L.push(`  signal ${outs.map((p) => `o_${pinPort(p)}`).join(', ')} : std_logic := 'X';`, '  signal pw : boolean;', 'begin', `  pw <= ${vcc} = '1' and ${gnd} = '0';`,
    `  process (${ins.map(pinPort).join(', ')})`, `    variable ${ins.map((p) => `i_${pinPort(p)}`).join(', ')} : std_logic;`, ...(d.vars?.vhdl || []).map((v) => `    ${v}`), '  begin');
  for (const p of ins) L.push(`    i_${pinPort(p)} := rd(${pinPort(p)});`);
  L.push(`    if anyx(${ins.map((p) => `i_${pinPort(p)}`).join(' & ')}) then`, `      ${outs.map((p) => `o_${pinPort(p)} <= 'X';`).join(' ')}`, '    else', ...d.vhdl.map((l) => `      ${l}`), '    end if;', '  end process;');
  for (const p of outs) L.push(`  ${pinPort(p)} <= ${p.dir === 'oc' ? `oc(o_${pinPort(p)})` : `o_${pinPort(p)}`} after ${d.tpd} ns when pw else 'Z' after ${d.tpd} ns;`);
  L.push('end architecture model;', '');
}

function verilogMsi(L, name, d) {
  const ins = d.pins.filter((p) => p.dir === 'in'), outs = d.pins.filter(isOut);
  const vcc = pinPort(d.pins.find((p) => p.dir === 'vcc')), gnd = pinPort(d.pins.find((p) => p.dir === 'gnd'));
  L.push(`// ${d.chip}: ${d.title.toLowerCase()} (typical delay ${d.tpd} ns)`, `module ${name} (${icPorts(d).map((p) => `${isOut(p) ? 'output' : 'input'} ${pinPort(p)}`).join(', ')});`,
    ...(d.family === 'cmos' ? ['  // a CMOS input reads a floating (z) level unknown (x)', '  function rd(input s);', "    rd = (s === 1'bz) ? 1'bx : s;", '  endfunction']
      : ['  // a 74LS input reads a floating (z) level high', '  function rd(input s);', "    rd = (s === 1'bz) ? 1'b1 : s;", '  endfunction']));
  if (outs.some((p) => p.dir === 'oc')) L.push('  // an open collector output: a 0, or nothing', '  function oc(input s);', "    oc = (s === 1'b0) ? 1'b0 : (s === 1'b1) ? 1'bz : 1'bx;", '  endfunction');
  L.push(`  wire pw = (${vcc} === 1'b1) && (${gnd} === 1'b0);`);
  for (const p of ins) L.push(`  wire i_${pinPort(p)} = rd(${pinPort(p)});`);
  if (d.seq) {
    // (a sequential IC: its registers and always blocks, its outputs o_<port> assigned)
    L.push(`  wire ${outs.map((p) => `o_${pinPort(p)}`).join(', ')};`, ...d.verilog.decl.map((v) => `  ${v}`), ...d.verilog.body.flatMap((l) => (/^always @\(.*edge/.test(l) ? [CLOCK_NOTE.verilog, `  ${l}`] : [`  ${l}`])));
    for (const p of outs) L.push(`  assign #${d.tpd} ${pinPort(p)} = pw ? o_${pinPort(p)} : 1'bz;`);
    L.push('endmodule', '');
    return;
  }
  L.push(`  reg ${outs.map((p) => `o_${pinPort(p)} = 1'bx`).join(', ')};`, '  always @* begin',
    `    if (^{${ins.map((p) => `i_${pinPort(p)}`).join(', ')}} === 1'bx) begin ${outs.map((p) => `o_${pinPort(p)} = 1'bx;`).join(' ')} end`, '    else begin', ...d.verilog.map((l) => `      ${l}`), '    end', '  end');
  for (const p of outs) L.push(`  assign #${d.tpd} ${pinPort(p)} = pw ? ${p.dir === 'oc' ? `oc(o_${pinPort(p)})` : `o_${pinPort(p)}`} : 1'bz;`);
  L.push('endmodule', '');
}

// (a clocked process's clock read as the chip reads its pins, a floating 74LS input high: logic before it, on purpose)
const CLOCK_NOTE = { vhdl: '  -- silinx: ignore data-as-clock (the IC\'s pins read as the chip reads them)', verilog: '  // silinx: ignore data-as-clock clock-as-data (the IC\'s pins read as the chip reads them; a clock its direction too)' };
// a sequential IC in VHDL: its inputs read into signals, its registers and processes (core/circuit-seq.js), its outputs
function vhdlSeq(L, d, ins, outs, vcc, gnd) {
  L.push(`  signal ${ins.map((p) => `i_${pinPort(p)}`).join(', ')} : std_logic := 'X';`, `  signal ${outs.map((p) => `o_${pinPort(p)}`).join(', ')} : std_logic := 'X';`,
    ...d.vhdl.decl.map((v) => `  ${v}`), '  signal pw : boolean;', 'begin', `  pw <= ${vcc} = '1' and ${gnd} = '0';`, ...ins.map((p) => `  i_${pinPort(p)} <= rd(${pinPort(p)});`),
    ...d.vhdl.body.flatMap((l) => (l.startsWith('process (') ? [CLOCK_NOTE.vhdl, `  ${l}`] : [`  ${l}`])));
  for (const p of outs) L.push(`  ${pinPort(p)} <= o_${pinPort(p)} after ${d.tpd} ns when pw else 'Z' after ${d.tpd} ns;`);
  L.push('end architecture model;', '');
}

// ------------------------------------------------------------------ an MSI or sequential IC's digital architecture (#3901)
// what synthesis builds (core/circuit-digital.js instances it): its inputs as they are, its body, its outputs while
// powered (vcc and not gnd: the supply's constants), no delay; `anyx` false (a register is never unknown there)
const isPort = (p) => p.dir === 'in';
// a line of a sequential IC's model with its inputs' i_<port> read as the ports themselves
const portsRead = (l, ins) => ins.reduce((s, p) => s.replace(new RegExp(`\\bi_${pinPort(p)}\\b`, 'g'), pinPort(p)), l);
// its three-state outputs driven, a disabled one high (no three-state inside an FPGA: the top takes their enable and
// gives their net its own level then, core/circuit-digital.js)
const driven = (l, d, V) => {
  const e = d.seq.threeState?.enable;
  if (!e) return l;
  return V ? l.replace(new RegExp(` else 'Z' when i_${e} = '[01]' else 'X';$`), " else '1';") : l.replace(new RegExp(`\\(i_${e} === 1'b[01]\\) \\? 1'bz : 1'bx;$`), "1'b1;");
};

/** The VHDL digital architecture of an MSI or sequential IC's entity, its lines pushed on L. */
export function vhdlDigital(L, name, d) {
  const ins = d.pins.filter(isPort), outs = d.pins.filter(isOut);
  const vcc = pinPort(d.pins.find((p) => p.dir === 'vcc')), gnd = pinPort(d.pins.find((p) => p.dir === 'gnd'));
  L.push(`architecture digital of ${name} is`, '  function anyx(v : std_logic_vector) return boolean is', '  begin', '    return false;', '  end function anyx;',
    `  signal ${outs.map((p) => `o_${pinPort(p)}`).join(', ')} : std_logic;`);
  // (a sequential IC's body reads its ports themselves: no copy of its clock, whose net synthesis then names after it)
  if (d.seq) L.push(...d.vhdl.decl.map((v) => `  ${portsRead(v.replace(/ := (\(others => 'X'\)|'X')/, ''), ins)}`), 'begin', ...d.vhdl.body.map((l) => `  ${portsRead(driven(l, d, true), ins)}`));
  else L.push('begin', `  process (${ins.map(pinPort).join(', ')})`, `    variable ${ins.map((p) => `i_${pinPort(p)}`).join(', ')} : std_logic;`, ...(d.vars?.vhdl || []).map((v) => `    ${v}`),
    '  begin', ...ins.map((p) => `    i_${pinPort(p)} := ${pinPort(p)};`), ...d.vhdl.map((l) => `    ${l}`), '  end process;');
  for (const p of outs) L.push(`  ${pinPort(p)} <= o_${pinPort(p)} and ${vcc} and not ${gnd};`);
  L.push('end architecture digital;', '');
}

/** The Verilog digital body of an MSI or sequential IC's module (after its `else). */
export function verilogDigital(d) {
  const ins = d.pins.filter(isPort), outs = d.pins.filter(isOut);
  const vcc = pinPort(d.pins.find((p) => p.dir === 'vcc')), gnd = pinPort(d.pins.find((p) => p.dir === 'gnd'));
  const L = [];
  if (d.seq) L.push(`  wire ${outs.map((p) => `o_${pinPort(p)}`).join(', ')};`, ...d.verilog.decl.map((v) => `  ${portsRead(v.replace(/ = (\d+'[bh]x+|1'bx)/g, ''), ins)}`), ...d.verilog.body.map((l) => `  ${portsRead(driven(l, d, false), ins)}`));
  else L.push(...ins.map((p) => `  wire i_${pinPort(p)} = ${pinPort(p)};`), `  reg ${outs.map((p) => `o_${pinPort(p)}`).join(', ')};`, '  always @* begin', ...d.verilog.map((l) => `    ${l}`), '  end');
  for (const p of outs) L.push(`  assign ${pinPort(p)} = o_${pinPort(p)} & ${vcc} & ~${gnd};`);
  return L;
}

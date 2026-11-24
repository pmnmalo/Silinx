In short:

- **Circuits:** a buzzer among the Outputs: on, it sounds at its own tone; driven with a square wave (an Arduino's
  tone()), at that wave's frequency, drawn while it sounds.

In detail:

- A buzzer as a circuit's part (#5454, part of #3902): core/circuit-buzzer.js, an active buzzer's + and −; driven
  steadily it sounds at its own tone (2.3 kHz), with a square wave at the wave's frequency measured from rise to rise
  in the simulation's time, at 0 silent; a tone no one hears said once. Its HDL (core/circuit-hdl-buzzer.js, simulation
  only, as the servo's): it says when it comes on and its tone as it changes, in VHDL and in Verilog, the live one's.
  Drawn as the part (web/js/circuit-draw-buzzer.js, its colours CSS tokens), its waves and its tone while sounding. Its
  checks (its − off GND, its + driven by nothing, joined to nothing), Part info, the Parts panel's Outputs,
  Portuguese; left out of the KiCad export. The MCP: simulate_drawing and a System's simulate say its tone,
  circuit_parts lists it. Tests: circuit-buzzer (its tones, in a circuit, its checks, its HDL in VHDL and in Verilog
  with no lint warnings and the live one's lines, an Arduino's Timer1 sounding it at 440 Hz through a System),
  mcp-circuit, web-i18n, circuit-coverage, kicad-library; the UI's circuit-buzzer, both interfaces and Portuguese, and
  the Parts panel's counts (Fixes #5454)

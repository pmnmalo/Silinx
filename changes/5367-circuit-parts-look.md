In short:

- **The circuit's parts look like the real ones:**
  - an LED is a 5 mm LED with its legs, lit in its colour;
  - a push button is a 6 mm tactile switch;
  - the switches have a metal frame and a black lever, and a DIP switch has white levers;
  - the 7-segment display has slanted segments;
  - a pull-up or pull-down is a resistor with its colour bands;
  - the LCD and the OLED are on their green and blue boards;
  - the servo is a blue SG90 with its coloured wires.

In detail:

- **The parts drawn as the real ones look, as far as practical (#5367):**
  - `web/js/circuit-draw.js`:
    - the LED: its dome and rim in its colour, see-through while dark and glowing while lit, its legs (the anode's bent), its shine;
    - the logic switch: a slide switch, with a metal frame, a slot and a black lever;
    - the push button: a 6 mm tactile switch, with a black base, a metal plate, four studs and a round cap, lit round its edge while pressed;
    - the supply: binding posts.
  - `circuit-draw-parts.js`:
    - the SPDT slide switch;
    - the DIP switch: a red body, white levers in dark slots, numbered, ON beside them;
    - the clock source: an oscillator's can;
    - the pull-up and pull-down: a resistor with 10 kΩ's bands and its lead;
    - the 7-segment display: slanted hexagonal segments, glowing while lit.
  - `circuit-draw-lcd.js`: the LCD's green board, its four mounting holes, its pins 1 and 16 marked, a black bezel round its glass.
  - `circuit-draw-oled.js`: the OLED's blue board, its mounting holes, its pins' names printed under them.
  - `circuit-draw-servo.js`: the SG90's blue case, its mounting ears, its gear housing, its brown, red and orange wires, its horn's holes.
  - Their pins are where they were, and their states (lit, pressed, a lever, the arm) are drawn as before.
  - The parts' own colours are CSS tokens in `web/css/circuit-editor.css` (`--circ-metal`, `--circ-plastic`, `--circ-pcb-green`, `--circ-pcb-blue`, `--circ-servo`…). They are the same in the dark theme, where the black plastic has a grey edge.

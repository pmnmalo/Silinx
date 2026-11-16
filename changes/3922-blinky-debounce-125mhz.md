In short:

- The blinky example's speed buttons work on a board clocked above 104.8 MHz (the Zybo Z7's 125 MHz).

In detail:

- **blinky's debouncers on a fast clock (#3922):** `speed_ctrl`'s debounce counters (`cnt_f`, `cnt_s`, in the ASM
  chart and its generated VHDL) are 22 bits wide instead of 21, so they reach `DEBOUNCE - 1` (`CLK_HZ / 50`, 20 ms)
  on every board up to 209 MHz: on the Zybo Z7's 125 MHz (`DEBOUNCE` 2,500,000) the faster / slower buttons did
  nothing, and Vivado removed their logic (`Synth 8-6014`, `Synth 8-7129`), warnings now gone.

In detail:
- The lock example's UI test (#5111) reads the last example New Project shows, not the last of its list: the co-design examples, after lock, are there hidden for an FPGA project (#4702), and it read regs-avr's since #5288; it failed on main in both interfaces (#5176, #5177).

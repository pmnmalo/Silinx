In detail:

- **The interfaces' parity test and Simulate's side panel (#5992):** `test/ui/interface-parity`'s collector reads the
  Silinx interface's Simulate side panel's rows too (out of `#left`): its test benches' menus have New Test Bench…, the
  ISE style's Create Test Bench (Wizard)…'s counterpart, since its bar went (#5939). A test bench's menu there says
  Remove… (Remove from Project before), as every source's menu since #5897, its command still Remove from Project.

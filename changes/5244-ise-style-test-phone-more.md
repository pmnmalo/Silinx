In detail:

- **The UI test of View ▸ Interface's ISE style leaves out the phone's More tools button (#5244):** it counts the main
  toolbar's buttons not shown in the ISE style (none: every tool kept), and since the phones' toolbar (#5121) that count
  took in its More tools button, shown under 600 px only, so the test failed on main in both interfaces.

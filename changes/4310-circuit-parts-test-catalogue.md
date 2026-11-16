In detail:

- **The Parts panel's test knows the KiCad catalogue's group (#4310):** test/ui/circuit-parts.test.js listed the panel's
  groups without the folded *KiCad catalogue* added by #4305, and so failed on main.

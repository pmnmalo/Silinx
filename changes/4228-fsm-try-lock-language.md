In detail:

- **The state diagram's HDL Language locked while Try it is open (#4228, #4226, #4227):** the FSM editor's ⋮ menu's HDL
  Language choices (#4063) stayed enabled while Try it locks the diagram (#3793), as its other choices are not; they are
  locked with them now, a locked diagram being as a read-only one, which has none. Test: ui/fsm-try-locked, in both
  interfaces (it failed on main in the nightly CI).

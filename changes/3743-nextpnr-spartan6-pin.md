In short:

- **Spartan-6: a multiplier fed by counters builds with nextpnr's Map:** a product of two counters (on the DSP48A1s)
  no longer stops Map with "its pin BMUX carries two nets", now that nextpnr's Map is the default.

In detail:

- **nextpnr-himbaechel-spartan6 0.5.2 (#3743):** the Spartan-6's nextpnr pinned at 0.5.2, whose packer has the rule of
  Silinx's Map for a carry's multiplexed outputs (#3151, pmnmalo/nextpnr-spartan#47): #3151's design, which nextpnr's
  Map (the default since #3140) stopped on, packs, places and routes. THIRD-PARTY-NOTICES follows. Tests: s6-nextpnr-pack
  (#3151's product in Verilog and VHDL by nextpnr's Map on the Nexys3, the application's flow: packed, routed on every
  seed, its three DSP48A1s, no warnings; it fails on 0.5.1).

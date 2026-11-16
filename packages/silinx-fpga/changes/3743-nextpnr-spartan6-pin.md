In detail:

- **nextpnr-himbaechel-spartan6 0.5.2 (#3743):** the Spartan-6's nextpnr pinned at 0.5.2 (pmnmalo/nextpnr-spartan#47):
  its packer no longer puts a 5FF on a position whose multiplexed output its logic needs (the carry's sum or carry out,
  an F7 / F8, an O5 leaving the slice), the rule of Silinx's Map (`muxNeeded` of `fpga/s6/pack.js`, #3151). A product of
  two counters into the DSP48A1s, which stopped nextpnr's packing ("its pin BMUX carries two nets"), packs, places and
  routes with nextpnr's Map. Its chip databases are 0.5.1's (the packer changed only). THIRD-PARTY-NOTICES follows.

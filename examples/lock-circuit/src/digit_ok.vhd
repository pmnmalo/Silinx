-- digit_ok: combinational module generated from the Boolean algebra digit_ok.bool.json (Silinx Boolean Algebra / Karnaugh Map).
-- Edit the table, not this file: the file is generated from it. Inputs: pos1, pos0, d3, d2, d1, d0 (pos1 is the
-- most significant bit of a row).
--
-- ok = Σm(2, 16, 34, 54)
-- ok = pos0'·d3'·d2'·d1·d0' + pos1'·pos0·d3'·d2'·d1'·d0' + pos1·pos0·d3'·d2·d1·d0'   (minimal SOP, 17 literal(s), 6 gate(s), delay 3)

library ieee;
use ieee.std_logic_1164.all;

entity digit_ok is
    port (
        pos1, pos0, d3, d2, d1, d0 : in  std_logic;
        ok : out std_logic
    );
end digit_ok;

architecture truth_table of digit_ok is
begin
    ok <= (not pos0 and not d3 and not d2 and d1 and not d0) or (not pos1 and pos0 and not d3 and not d2 and not d1 and not d0) or (pos1 and pos0 and not d3 and d2 and d1 and not d0);
end truth_table;

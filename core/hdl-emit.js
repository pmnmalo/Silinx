// Silinx HDL generators' shared primitives (#4768): the texts every generator writes the same way, one copy of each,
// so that their output stays the same everywhere. The generators move to them one family at a time, with the same
// bytes as before. Isomorphic (no DOM, no Node APIs).

/** The VHDL type of a port or signal of `w` bits: std_logic for 1, else std_logic_vector(w-1 downto 0). */
export const vhdlType = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);

/** The Verilog range of a declaration of `w` bits, with its space after it: '[w-1:0] ', none for 1 bit (or less). */
export const vlogRange = (w) => (w > 1 ? `[${w - 1}:0] ` : '');

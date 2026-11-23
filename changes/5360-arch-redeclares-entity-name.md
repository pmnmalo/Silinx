In short:
- Check Syntax reports an architecture's signal, constant or type with the name of its entity's generic or port, in any case, as ISE does (the lock example's `tick` and `TICK`).

In detail:
- An architecture's declaration with the name of one of its entity's generics, ports or declarations, in any case, is an error, "Redeclaration of symbol …" (XST's HDLParsers:1202), at its line, for an entity of the same file or of another one: Silinx accepted what XST refused (#5180), so the example built in the open flow and failed in ISE (#5360).

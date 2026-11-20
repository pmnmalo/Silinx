In short:
- The MCP server's list of tools is about a fifth smaller in an AI assistant's context, and it speaks the protocol's
  newest version (2025-11-25).

In detail:
- The MCP server's protocol (#4752, server/mcp-protocol.js): the versions it speaks in one place, 2025-11-25 the newest;
  JSON-RPC batches only in 2025-03-26 (the version that had them); nothing but ping before initialize; a message (a line
  of stdin) never read whole past 32 MiB.
- A renamed argument's old name (design_only, #4103) is still accepted and said deprecated, from one table for every
  tool (server/mcp-aliases.js); the schemas list only the new names.
- The argument check knows a string's minLength, maxLength and pattern; a project's name is at most 255 characters.
- `tools/list` trimmed: its tools' and arguments' descriptions shortened, under a budget a test keeps (128 KiB; 700
  characters a tool, 250 an argument).

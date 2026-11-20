In detail:

- **MCP server: the "untrusted content" label with a nonce, and on every tool that takes a project (#4738):** a result
  that holds a project's or a remote's text ends with "[End of untrusted content <nonce> (…)]", its nonce random for
  each call and in `structuredContent.untrusted` too, so a file cannot imitate it; look-alikes of the label in the
  result's text and structured content are neutralised ("(quoted: …"). Every tool that takes a project is labelled by
  default (simulate_drawing, the wave configurations, capture, the state diagrams', schematics' and circuits' tools…);
  a result with Silinx's own text only opts out (`untrusted: false`: the guided labs of Silinx). SECURITY.md and the
  MCP guide say so.

# O Silinx num assistente de IA (MCP)

[Guia do utilizador](README.md) · [English](../en/ai-mcp.md) · Português

Um assistente de IA (o Claude, ou qualquer cliente do Model Context Protocol) pode trabalhar nos seus projetos do
Silinx: criar um a partir de um exemplo, escrever um módulo, desenhar uma máquina de estados, correr a simulação e a
implementação, ler os relatórios. Tudo o que a interface faz é uma ferramenta do servidor MCP do Silinx, feita pelas
mesmas funções, com as mesmas verificações e mensagens.

## Ligá-lo

Com o Silinx instalado no seu computador ([Começar](getting-started.md), forma 2), o assistente arranca o
`silinx mcp`. No Claude Code: `claude mcp add silinx -- node /path/to/silinx/bin/silinx.js mcp`; no Claude Desktop, o
seu `claude_desktop_config.json`:

```json
{ "mcpServers": { "silinx": { "command": "node", "args": ["/path/to/silinx/bin/silinx.js", "mcp"] } } }
```

Depois peça, por exemplo: *"Faz um projeto a partir do exemplo traffic para uma Nexys2, simula-o e diz-me os avisos."*
Os ficheiros só entram e saem dos projetos por uma pasta de troca: as suas Transferências, ou a pasta que
`SILINX_MCP_FOLDER` indicar.

A lista das ferramentas, e o que cada uma faz: [a página em inglês](../en/ai-mcp.md#its-tools).

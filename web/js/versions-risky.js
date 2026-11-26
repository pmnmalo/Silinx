// The page's commands that replace or remove a project's files (#5740), by their menu's label: a version of the project
// is kept before each (web/js/versions.js versionBefore; the MCP's tools of the same names: server/mcp-versions.js).
//   riskyReason(label) -> core/versions.js's reason ('before-…'), or null
const RISKY = [[/^Remove from Project/, 'before-remove'], [/^Delete (File|Folder)/, 'before-delete'], [/^Convert/, 'before-convert'],
  [/^(Add Copy to Project|Add Source|Import Source|Import Test Bench)/, 'before-import'], [/^Merge Contribution/, 'before-merge'], [/^(Pull|Merge Branch|Switch Branch)/, 'before-git'], [/^Change Mode/, 'before-mode']];

export const riskyReason = label => RISKY.find(([re]) => re.test(String(label || '')))?.[1] ?? null;

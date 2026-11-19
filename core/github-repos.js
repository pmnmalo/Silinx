// The user's GitHub repositories (#4653): File ▸ Open from GitHub Repository…'s list and the MCP's git_repositories.
// Those the account owns, collaborates on or has through an organization (a GitHub Classroom assignment's), the most
// recently pushed first, from GitHub's API (GET /user/repos), page by page; the caller's `get` asks for each page
// (the browser edition's sign-in, a server's token, or GitHub's command line: server/git-repos.js). Isomorphic.

const PER_PAGE = 100, MAX_PAGES = 3;
/** The API's path of a page of the user's repositories. */
export const reposPath = page => `/user/repos?per_page=${PER_PAGE}&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`;

/** A repository as the list shows it: { repository: 'owner/name', url, private, description, pushedAt }. */
export const repoEntry = j => ({
  repository: String(j.full_name), url: String(j.html_url || `https://github.com/${j.full_name}`),
  private: !!j.private, description: j.description ? String(j.description) : '', pushedAt: j.pushed_at || null,
});

/** The user's repositories (get: async path -> the page's array), at most 300, the most recently pushed first. */
export async function listRepositories(get) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const a = await get(reposPath(page));
    if (!Array.isArray(a)) break;
    out.push(...a.filter(j => j && j.full_name).map(repoEntry));
    if (a.length < PER_PAGE) break;
  }
  return out;
}

/** The repositories whose name, owner or description has the query (any case); an address: its owner/name. */
export function filterRepositories(list, query) {
  let q = String(query || '').trim().toLowerCase();
  if (!q) return list;
  const m = /github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(q);
  if (m) q = m[1];
  return list.filter(r => r.repository.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
}

/** A repository's line, as the MCP's text and the list's title say it. */
export const repoLine = r => `${r.repository}${r.private ? ' (private)' : ''}${r.description ? `: ${r.description}` : ''}`;

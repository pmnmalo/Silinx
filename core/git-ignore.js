// What git never commits of a project (#3195, #3196): the tools' outputs, made again from the sources, whatever the
// repository's .gitignore says, and the .gitignore Silinx writes into a project. The server's git (server/git.js) and
// the browser's GitHub back end (core/git-rest.js) share them. Isomorphic.

// the tools' outputs, never committed whatever the repository's .gitignore says (pathspecs, relative to the project)
export const OUTPUTS = ['build', 'xst', '_xmsgs', 'iseconfig', 'isim', '.Xil', '*.bit', '*.ncd', '*.ngc', '*.ngd', '*.xdl', '*.xdlrc', '*.wdb'];
export const GLOBS = OUTPUTS.map(p => (p.startsWith('*') ? `**/${p}` : `${p}/**`));
export const EXCLUDE = GLOBS.map(g => `:(exclude,glob)${g}`);
export const isOutput = rel => {
  const parts = rel.split('/');
  return OUTPUTS.some(p => (p.startsWith('*') ? rel.toLowerCase().endsWith(p.slice(1)) : parts[0] === p));
};

// a write's temporary file (server/projects.js writeAtomic: .<name>.<pid>.<random>.tmp beside the file, renamed over it
// once flushed, #4758): no change of the project's, never listed nor committed, though a status read during the write
// sees it (#5016)
export const WRITE_TEMP = '**/.*.tmp';
export const isWriteTemp = rel => /(^|\/)\.[^/]+\.\d+\.[0-9a-z]*\.tmp$/.test(rel);

/** The .gitignore Silinx writes into a project (Store Project in a GitHub Repository…, and before a commit when it has none). */
export const GITIGNORE = `# Silinx (#3195): what the tools make again from the sources is not committed
build/
xst/
_xmsgs/
iseconfig/
isim/
.Xil/
*.bit
*.ncd
*.ngc
*.ngd
*.xdl
*.xdlrc
*.wdb
.DS_Store
`;

In short:

- **Sign out of GitHub asks first:** in the browser edition, Sign out of GitHub (File ▸ Git ▸, the Collaboration tab)
  now asks before it forgets the sign-in, Cancel being the default. With a pasted personal access token it says that
  signing in again needs that token (keep a copy) or a new one; after Sign in with GitHub, that you can sign in again
  at any time. Either way it says the token or the authorization stays valid on GitHub until you revoke it there, and
  links the page where you do.

In detail:

- **Sign out of GitHub confirmed (#4256):** `web/js/git-signin.js` `signOut()` shows a dialog first (Sign Out, and
  Cancel as the default button: Enter, Escape and Cancel keep the sign-in, its console line "Sign out of GitHub was
  cancelled: still signed in."), its text by how the user signed in: a pasted token (github.com/settings/
  personal-access-tokens linked) or the device flow (Settings ▸ Applications linked). The console's line after signing
  out says the same: forgotten in this browser, still valid on GitHub, and where to revoke it; never the token. How the
  sign-in was made is kept beside the token (`web/js/git-browser.js`, `githubSignedInWay()`: a pasted token or the
  device flow; one kept by an older Silinx: the edition's way) and forgotten with it. The local server editions have
  no Sign out (git signs in with its own credentials) and no MCP tool signs out: nothing changes there. Tests: unit
  (`test/github-signin.test.js`: the way kept and forgotten), UI (`test/ui/git-sign-out.test.js`: the dialog of each
  way, Cancel, Enter and Escape keeping the sign-in, Sign Out forgetting it, the exact console lines, from the File
  menu and the Collaboration tab, in Portuguese, in both interfaces, no warnings).

In short:

- **The toolbar's Sharing menu switches a follower's role:** each follower's row has the Collaboration tab's Viewer |
  Editor selector.

In detail:

- **The Sharing menu's Viewer | Editor (#4849):** for the owner, each follower's row of the toolbar's Sharing menu now has
  the same Viewer | Editor selector as the Collaboration tab's Sharing box (#4646): the current role pressed, the other
  one a click away, Editor disabled in a share with no editors' link. Both use one function (`web/js/collab-roles.js`),
  through the same role change as the MCP's. The menu stays open when the selector is clicked; a change made in it shows
  at once in the Collaboration tab, and one made in the tab shows at once in an open menu. The owner's own row keeps
  "you".

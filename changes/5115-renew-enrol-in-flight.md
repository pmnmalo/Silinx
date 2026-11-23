In short:

- **Renew Editor Link:** an editor who had just joined with the editors' link when the owner renewed it keeps editing:
  they were sometimes made a viewer, and their next change never reached the owner.

In detail:

- **An editor's request to be listed, handled after the editors' link was renewed, still taken from one in the room
  then (#5115):** an editor link's page asks the owner to list its key, the request signed with the link's key; the
  owner checked it against the link's key of the moment it got to it. Renewed meanwhile (the owner had the editor's
  awareness, "Rui edits your project", but not yet their request), the editor was told "this editor link is not this
  shared project's, or its owner renewed it" and followed read only, their change in the editor dropped. The owner keeps
  the link's last keys with the participants in the room at each renewal (core/collab-client.js): a request signed with
  one of them, from one in the room then, is taken (the same at a rejoin); a copy of the old link opened later is still
  refused.

In short:

- Live sharing: an editor's change to the project's sources (a file renamed, added or removed) is no longer lost in the
  project's description when the owner's Silinx writes it out at the same moment.

In detail:

- **An editor's description kept (#5064):** the project's description is one shared value, and when two participants
  set it at the same time one of the two is kept. The owner publishes the description again after each editor's change
  that touches it, so the editor's next change, set at that moment, could be the one lost. Its files were moved on the
  owner's disk, but the description no longer listed the renamed file, and nothing said so. The editor now also
  proposes its description under a key of its own (`core/collab-files.js` `setDescription`). `watchDoc` gives that
  proposal with the change, and the owner applies it rather than the shared value (`applyEdits`). This is what made
  `test/mcp-collab.test.js`'s #4418 test time out under load ("renamed at the owner's", after #4480 and #4569).
- **An editor waiting to be listed (#5064, #4745):** an editor's changes waiting for the owner to list its key no
  longer wait for ever when the list arrives during their first check: the list is checked again once they wait.

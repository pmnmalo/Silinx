In short:

- **Browsing alone while following:** a viewer who clicks in the Design pane, or opens a document, while the owner's
  documents are still opening on their page (a slow page) keeps what they opened in front: the owner's document no
  longer comes over it once it has opened.

In detail:

- **A follower's look at the owner's activity stops when the follower browses alone (#4865):** the look that puts the
  owner's documents and view on a follower's page (web/js/collab-activity.js `followActivity`, from
  web/js/collab-follow.js) went on to the end after awaiting a document's opening, even when the follower had gone
  browsing alone meanwhile: the owner's document in front (their Design Summary) was then brought over the follower's
  own. Since #4820 the look runs as soon as the project is open, so on a slow page it was still opening the owner's
  Design Summary when the follower's own click came: the read-only notice UI test (#3181) found the Design Summary in
  front instead of its text file. The look now checks after every opening that the follower still follows, and stops
  there; the document opened stays behind. A UI test holds the follower's summary.js (CDP's Fetch) to make the race
  certain, in both interfaces.

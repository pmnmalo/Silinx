In short:

- **A follow link given while Silinx starts:** a shared project's link pasted into the address bar while the page
  was still starting is now followed once it is up, as one pasted later; it could be missed, or refused as a design's
  link ("the link names no design").

In detail:

- **A follow link given while the app starts (#4234):** `web/js/app.js` keeps the hash its start-up read: a shared
  project's link that comes after it is no longer read as a design's link (which refused it, the hash cleared), and
  `web/js/link-hash.js` `watchLinks(target, seen)` opens a link the hash gives that differs from the start-up's, once
  the links are watched (its `hashchange` came before the listener). The cause of `test/ui/collab.test.js`'s "#3318 a
  follow link pasted into an open tab" timing out on a loaded runner: its follower changed the hash once the start-up
  checks were written, which may be before the app watches the links. Test: `test/ui/collab.test.js` "#4234" (a link
  given as the page loads, and a hash changed before the links are watched, opened then; no warnings nor errors).

In detail:

- **Share Project… ▸ A copy: the link's box fitted as the window opens (#4639):** the box is the size of the link
  from the window's first frame rather than one frame later, so its buttons stay where they are first shown. Its
  tests (test/ui/link-qr.test.js, test/ui/gist-link.test.js) also let the window's layout settle before they click a
  button by its position, which made them flaky on a slow machine.

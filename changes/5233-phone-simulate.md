In short:

- **Phones:** simulate and read the waves on a phone: Simulate's panel and the waves each take the whole screen,
  switched by the bar of panes; a finger places the cursor, two fingers scroll the time, a pinch zooms it.

In detail:

- Simulating on a phone, the fourth phase of #5121 (#5233): under 600 px Simulate's side panel is the Panels pane,
  the whole width (what to simulate, then SSim's Instances and Objects), and the waves the Document pane, the whole
  width (`web/css/phone.css`); in the ISE style interface SSim's window keeps its Instances and Objects, above its
  waves. The waves' names and values columns are narrower there (100 and 56 px, a wave configuration's widths win,
  `web/js/isim.js`). A task with no document yet (Simulate, Emulate) opens on its side panel (`web/js/phone.js`). UI
  tests at 375 × 812 and 430 × 932 with touch, both interfaces, the waves' cursor, scroll and pinch by touch
  (`test/ui/phone-sim.test.js`).

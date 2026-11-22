In short:

- **Phones:** under 600 px wide Silinx shows one pane at a time, the whole screen: the side panel, the document or the
  console, switched by a bar of three buttons at the bottom (Panels, Document, Console).

In detail:

- A phone's layout, the first phase of #5121 (#5207): under 600 px (`PHONE_QUERY` of `web/js/narrow.js`) one pane at a
  time, the whole width and height (`web/js/phone.js`, `web/css/phone.css`): the side panel, the document in front or
  the console, switched by the bar of panes above the Silinx interface's task tabs. A project opened or closed shows the
  side panel, a document opened shows it, a task chosen (Simulate, Emulate, Implement) its document; a new error or
  warning marks the Console button until the console is shown. The narrow screen's drawer, the splitters and the
  Layout buttons give way to it; at 600 px and more nothing changes. Both interfaces, in Portuguese; UI tests at
  375 × 812 and 430 × 932 with touch (`test/ui/phone.test.js`).

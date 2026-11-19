// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// Simulate's side panel's width dragged (#4627), as the other tasks' side panel: its handle over the panel's right edge
// (#center's --sim-side, web/js/tasks-sim.js fitSimTabs; web/css/tasks.css), the side panel's splitter's own (ui.js
// splitter and LEFT_SPLIT, #v-split's): the width is #left's, the one the other tasks show, with their limits and their
// key (xl.leftW), remembered as theirs; the panel (nothing simulated, or SSim's Instances and Objects) at most 45 % of
// the work area, as its CSS. Shown whenever the panel is (folded or maximized, none), on a narrow screen too.
import { h, splitter, LEFT_SPLIT } from './ui.js';
import { fitSimTabs } from './tasks-sim.js';

/** The handle, appended to the work area (`panel`: Simulate's own panel, measured again as it is resized). */
export function mountSimSplit(panel) {
  const ws = document.getElementById('workspace'), center = document.getElementById('center');
  const handle = h('div', { id: 'task-sim-split', hidden: true });
  ws.append(handle);
  const width = () => Number.parseFloat(center.style.getPropertyValue('--sim-side')) || 0;
  splitter(handle, document.getElementById('left'), {
    ...LEFT_SPLIT, size: width, max: () => Math.min(LEFT_SPLIT.max, Math.round(ws.clientWidth * 0.45)),
    // (the width the panels read, web/css/tasks.css and SSim's, web/js/isim.js; the handle moved with the edge)
    onSize: (w) => { document.documentElement.style.setProperty('--left-w', `${w}px`); fitSimTabs(); },
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitSimTabs()).observe(panel);
  return handle;
}

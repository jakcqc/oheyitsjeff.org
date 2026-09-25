/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
import { runVisualApp } from '../helper/visualHelp.js';
import './imageToSVG_visual.js';

document.addEventListener('DOMContentLoaded', () => {
  runVisualApp({
    visualId: 'imageToSVG',
    mountEl: document.getElementById('vis'),
    uiEl: document.getElementById('config'),
  });
});

function goTo(page) {
  window.location.href = page;
}
window.goTo = goTo;

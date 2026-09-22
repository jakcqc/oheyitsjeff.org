/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// Shared toolbar for switching between related editors without rebuilding them.
let nextTabId = 0;

export function createSubTabs({ label, options, value, onChange }) {
  const root = document.createElement("div");
  root.className = "vr-subTabs";
  root.setAttribute("role", "tablist");
  root.setAttribute("aria-label", label);
  const id = `vr-subtabs-${++nextTabId}`;
  const buttons = new Map();
  let selected = options.some((option) => option.value === value) ? value : options[0]?.value;

  const setValue = (next, notify = false) => {
    if (!buttons.has(next)) return;
    selected = next;
    for (const option of options) {
      const active = option.value === next;
      const button = buttons.get(option.value);
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (option.panel) option.panel.hidden = !active;
    }
    if (notify) onChange?.(next);
  };

  options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vr-subTab";
    button.textContent = option.label;
    button.id = `${id}-tab-${index}`;
    button.setAttribute("role", "tab");
    if (option.panel) {
      option.panel.id = `${id}-panel-${index}`;
      option.panel.setAttribute("role", "tabpanel");
      option.panel.setAttribute("aria-labelledby", button.id);
      button.setAttribute("aria-controls", option.panel.id);
    }
    button.onclick = () => setValue(option.value, true);
    button.onkeydown = (event) => {
      let nextIndex;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % options.length;
      if (event.key === "ArrowLeft") nextIndex = (index + options.length - 1) % options.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = options.length - 1;
      if (nextIndex == null) return;
      event.preventDefault();
      const next = options[nextIndex].value;
      setValue(next, true);
      buttons.get(next).focus();
    };
    buttons.set(option.value, button);
    root.appendChild(button);
  });
  setValue(selected);
  return { root, setValue, get value() { return selected; } };
}

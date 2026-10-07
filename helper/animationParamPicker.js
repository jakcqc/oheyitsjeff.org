/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */

const cleanText = value => typeof value === 'string' ? value.trim() : '';
const searchText = value => cleanText(value).toLowerCase();
let pickerSequence = 0;

/** Keep visual labels/help while expanding numeric vector components. */
export function numericAnimationParameters(spec) {
  const entries = new Map();
  for (const parameter of Array.isArray(spec?.params) ? spec.params : []) {
    const key = cleanText(parameter?.key);
    if (!key) continue;
    const label = cleanText(parameter.label);
    const description = cleanText(parameter.description);
    if (parameter.type === 'number') {
      // An explicitly declared component wins over a generated vector entry,
      // regardless of the order in which the visual declares its parameters.
      entries.set(key, { key, label: label || key, description });
    } else if (parameter.type === 'vector2D' || parameter.type === 'vector3D') {
      const axes = parameter.type === 'vector3D' ? ['x', 'y', 'z'] : ['x', 'y'];
      for (const axis of axes) {
        const componentKey = `${key}.${axis}`;
        if (!entries.has(componentKey)) entries.set(componentKey, {
          key: componentKey,
          label: label ? `${label} · ${axis.toUpperCase()}` : componentKey,
          description,
        });
      }
    }
  }
  return [...entries.values()];
}

/**
 * A text-input combobox that also accepts unlisted numeric property paths.
 * Selecting an option is separate from adding it to the animation: the next
 * Enter calls onCommit(key), or the caller can use getKey() from its Add button.
 */
export function createAnimationParamPicker({ parameters = [], onCommit } = {}) {
  const parameterMap = new Map();
  for (const parameter of parameters) {
    const key = cleanText(parameter?.key);
    if (key) parameterMap.set(key, {
      key,
      label: cleanText(parameter.label) || key,
      description: cleanText(parameter.description),
    });
  }
  const choices = [...parameterMap.values()];
  const searchable = choices.map(parameter => ({
    parameter,
    text: `${parameter.label} ${parameter.key} ${parameter.description}`.toLowerCase(),
  }));
  const id = `anim-param-picker-${++pickerSequence}`;
  const root = document.createElement('div');
  root.className = 'anim-param-picker';
  const input = document.createElement('input');
  input.className = 'anim-param-input';
  input.id = `${id}-input`;
  input.type = 'text';
  input.placeholder = 'Choose or type a numeric property';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('aria-label', 'Add animation parameter');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('aria-expanded', 'false');

  const dropdown = document.createElement('div');
  dropdown.className = 'anim-param-dropdown';
  dropdown.hidden = true;
  const list = document.createElement('div');
  list.className = 'anim-param-list';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Numeric animation properties');
  input.setAttribute('aria-controls', list.id);
  const empty = document.createElement('div');
  empty.className = 'anim-param-empty';
  empty.setAttribute('role', 'status');
  empty.textContent = 'No matching properties. You can enter a numeric property path.';
  empty.hidden = true;
  dropdown.append(list, empty);

  const help = document.createElement('div');
  help.id = `${id}-help`;
  help.className = 'anim-param-help';
  help.setAttribute('role', 'tooltip');
  help.setAttribute('aria-live', 'polite');
  help.hidden = true;
  root.append(input, dropdown, help);

  let selected = null;
  let filtered = [];
  let optionNodes = [];
  let activeIndex = -1;
  let isOpen = false;
  let destroyed = false;
  const listeners = [];
  const listen = (target, event, callback) => {
    target.addEventListener(event, callback);
    listeners.push(() => target.removeEventListener(event, callback));
  };

  const showHelp = parameter => {
    const description = parameter?.description || '';
    help.textContent = description;
    help.hidden = !description;
    if (description) input.setAttribute('aria-describedby', help.id);
    else input.removeAttribute('aria-describedby');
  };

  const setActive = (index, scroll = false) => {
    if (activeIndex >= 0 && optionNodes[activeIndex]) {
      optionNodes[activeIndex].setAttribute('aria-selected', 'false');
      optionNodes[activeIndex].removeAttribute('aria-describedby');
    }
    activeIndex = index >= 0 && index < filtered.length ? index : -1;
    const option = optionNodes[activeIndex];
    if (option) {
      option.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', option.id);
      showHelp(filtered[activeIndex]);
      if (!help.hidden) option.setAttribute('aria-describedby', help.id);
      if (scroll) option.scrollIntoView?.({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
      showHelp(null);
    }
  };

  const closeList = (retainSelectedHelp = false) => {
    isOpen = false;
    dropdown.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
    if (retainSelectedHelp) showHelp(selected);
  };

  const renderOptions = (activateMatch = false) => {
    const selectedText = selected && input.value === selected.label;
    const query = selectedText ? '' : searchText(input.value);
    const tokens = query.split(/\s+/).filter(Boolean);
    filtered = searchable.filter(entry => tokens.every(token => entry.text.includes(token)))
      .map(entry => entry.parameter);
    list.replaceChildren();
    activeIndex = -1;
    optionNodes = filtered.map((parameter, index) => {
      const option = document.createElement('div');
      option.className = 'anim-param-option';
      option.id = `${id}-option-${index}`;
      option.dataset.key = parameter.key;
      option.dataset.index = String(index);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.title = parameter.description;
      const label = document.createElement('span');
      label.className = 'anim-param-label';
      label.textContent = parameter.label;
      option.append(label);
      if (parameter.label !== parameter.key) {
        const key = document.createElement('span');
        key.className = 'anim-param-key';
        key.textContent = parameter.key;
        option.append(key);
      }
      list.append(option);
      return option;
    });
    empty.hidden = filtered.length > 0;
    // Do not silently resolve a duplicated label to whichever row came first.
    const duplicateExactLabel = query && filtered.filter(parameter => searchText(parameter.label) === query).length > 1;
    const selectedIndex = selectedText ? filtered.findIndex(parameter => parameter.key === selected.key) : -1;
    setActive(selectedIndex >= 0 ? selectedIndex : (activateMatch && query && !duplicateExactLabel && filtered.length ? 0 : -1));
  };

  const open = (activateMatch = false) => {
    if (destroyed) return;
    isOpen = true;
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    renderOptions(activateMatch);
  };

  const getKey = () => {
    const value = input.value.trim();
    if (selected && value === selected.label) return selected.key;
    // A literal known key takes precedence if another option happens to use
    // that same text as its friendly label.
    if (parameterMap.has(value)) return value;
    const matches = choices.filter(parameter => searchText(parameter.label) === searchText(value));
    return matches.length === 1 ? matches[0].key : value;
  };

  const choose = index => {
    const parameter = filtered[index];
    if (!parameter || destroyed) return;
    selected = parameter;
    input.value = parameter.label;
    input.title = parameter.description;
    if (document.activeElement !== input) input.focus({ preventScroll: true });
    // Keep help visible after a touch selection, when there is no hover state.
    closeList(true);
  };

  const optionForEvent = event => {
    const option = event.target?.closest?.('.anim-param-option');
    return option && list.contains(option) ? option : null;
  };
  const hoverOption = event => {
    const option = optionForEvent(event);
    if (option && isOpen) setActive(Number(option.dataset.index));
  };
  const keepInputFocus = event => {
    if (optionForEvent(event)) event.preventDefault();
  };

  listen(input, 'focus', () => open());
  listen(input, 'click', () => open());
  listen(input, 'input', () => {
    selected = null;
    input.removeAttribute('title');
    open(true);
  });
  listen(input, 'blur', () => closeList());
  listen(input, 'keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (!isOpen) {
        open();
        setActive(event.key === 'ArrowDown' ? 0 : filtered.length - 1, true);
      } else if (filtered.length) {
        const next = event.key === 'ArrowDown'
          ? (activeIndex + 1) % filtered.length
          : (activeIndex <= 0 ? filtered.length - 1 : activeIndex - 1);
        setActive(next, true);
      }
    } else if ((event.key === 'Home' || event.key === 'End') && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setActive(event.key === 'Home' ? 0 : filtered.length - 1, true);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen && activeIndex >= 0) choose(activeIndex);
      else {
        const key = getKey();
        closeList();
        if (key) onCommit?.(key);
      }
    } else if (event.key === 'Escape' && (isOpen || !help.hidden)) {
      event.preventDefault();
      event.stopPropagation();
      closeList();
    } else if (event.key === 'Tab') {
      closeList();
    }
  });
  listen(list, 'pointerdown', keepInputFocus);
  listen(list, 'mousedown', keepInputFocus);
  listen(list, 'pointerover', hoverOption);
  listen(list, 'mouseover', hoverOption);
  listen(list, 'click', event => {
    const option = optionForEvent(event);
    if (!option) return;
    // Cancel any outer label's default click forwarding, which would otherwise
    // click the input again and reopen a just-selected option list.
    event.preventDefault();
    event.stopPropagation();
    choose(Number(option.dataset.index));
  });

  return {
    root,
    input,
    getKey,
    clear() {
      if (destroyed) return;
      selected = null;
      input.value = '';
      input.removeAttribute('title');
      closeList();
    },
    close() { closeList(); },
    destroy() {
      closeList();
      destroyed = true;
      for (const removeListener of listeners) removeListener();
      root.remove();
    },
  };
}

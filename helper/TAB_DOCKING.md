The shared visual toolbar keeps its original vertical tab column, tab order,
toggle, and editor styling. Gestures can display several editors at once without
adding layout buttons, panel headers, or dropdowns.

To arrange the toolbar:

- Use the existing **+ / −** toggle to show or hide the vertical tab list.
- Click a tab to replace the editor in the panel you last clicked or focused.
  If that editor is already visible in another panel, the two editors swap.
- Hold a tab name for half a second to show only that editor and remove the splits.
  Mouse, touch, and pen all support this gesture. Moving starts a drag and cancels
  the hold gesture.
- Drag a tab inside an existing panel to replace its editor. Drag to a panel's
  left, right, top, or bottom edge to create a split there. Highlights appear only
  during dragging. Moving an already visible editor to an edge relocates its pane;
  dropping it on its own edge leaves it in place.
- Drag the divider between panels to resize them. Keyboard users can select tabs
  with Up/Down or Home/End and use **Shift+Enter** to focus one editor alone. A
  focused divider supports its direction's arrow keys and Home/End. **Escape**
  cancels a pending hold, drag, or resize.

Up to eight panels can be open. Panels retain usable minimum sizes, so a deeply
divided layout may scroll within the toolbar. Controls and each tab's scroll
position survive moves and replacements. Every tab stays available in its original
position in the global list. Layout changes participate in the app's shared Undo
history.

Layouts are stored in `state.__ui.dockLayout` through the existing per-app settings
and UI persistence. They travel with saved settings and standard settings-bearing
SVG exports. Automatic restoration after a reload requires the app's existing
**Remember settings for this visual** option to be enabled.

For developers, [visualHelp.js](visualHelp.js) delegates `mountUserTabs(options)`
to [tabDock.js](tabDock.js), with styles in [tabDock.css](tabDock.css). Continue
providing the existing `buildParamsPanel`, `extraTabs`, `state`, and `onUiChange`
options. Tab panels are built lazily, their DOM is cached when moved, and existing
`_onShow` / `_onHide` hooks follow panel visibility.

[tabDockModel.js](tabDockModel.js) contains the DOM-independent, immutable layout
operations and repairs saved layouts against the app's current tab names. Its
version-2 state has `{ version, tabs, root, activePaneId }`; `tabs` contains all
registered editors in their original order. `root` is a tree of pane nodes
`{ type: 'pane', id, active }` and split nodes
`{ type: 'split', id, axis, ratio, first, second }`. A `row` split places panels
left/right; a `column` split places them top/bottom. Ratios stay between 0.15 and
0.85. A visible editor appears in only one pane. Version-1 layouts migrate on load;
unknown or duplicate visible editors are removed and their empty branches collapse.

Run the pure model checks with:

```sh
node --experimental-default-type=module --test tests/tab-dock-model.mjs
```

Serve the repository and open
[/tests/tab-dock-regressions.html](../tests/tab-dock-regressions.html) for browser
integration checks, including panel movement, selection, state restoration, and
the existing shared toolbar behavior.

Shared visual controls accept `shouldShowWhen`, a map from selector state paths
to the values that make a control visible. The existing layout and control styles
stay the same; irrelevant rows and entirely empty categories are hidden.

```js
{
  key: 'voronoiSites',
  label: 'Voronoi sites',
  type: 'number',
  default: 256,
  min: 8,
  max: 768,
  shouldShowWhen: { method: 'voronoi' },
}

{
  key: 'growth',
  label: 'Logistic growth',
  type: 'number',
  default: 0.19,
  shouldShowWhen: { model: ['Keller-Segel', 'Fisher-KPP'] },
}
```

Match the selector's stored value exactly, including spelling and case. An array
matches any listed value. Multiple keys must all match:

```js
shouldShowWhen: {
  'filters.0.type': 'blur',
  'filters.0.enabled': true,
}
```

Dot paths support nested objects and indexed arrays. Values can be strings,
booleans, or finite numbers; matching does not convert their types. Omitted/null
conditions and empty maps impose no restriction. Missing selector values, empty
value arrays, and malformed conditions do not match. The option is data, with no
JavaScript expressions or callbacks to evaluate.

Changing a shared control refreshes conditions immediately, including controls
in other open or cached tabs for the same state object. Hiding a control preserves
its DOM, value, and saved settings; switching back restores that editor. Existing
Undo, settings loading, and programmatic app updates also refresh visibility.
The option is included in exported UI JSON specs.

`buildControl` supports this option both inside generated Params and in custom
panels. When a custom panel changes state outside shared controls, it can update
conditions without rebuilding inputs:

```js
import { syncControlVisibility } from './visualHelp.js';

state.method = 'voronoi';
syncControlVisibility(panel, state);
```

The pure matcher is `matchesParamVisibility(shouldShowWhen, state)` in
[paramVisibility.js](paramVisibility.js). Individual built rows also expose
`_syncVisibility()` for visibility alone and `_sync()` for the existing value and
visibility refresh. Normal visual apps can keep using their existing update path.

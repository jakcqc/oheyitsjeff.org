# Tool flows

The shared `flows` tab composes existing SVG tools into an ordered pipeline. A flow may contain any number of these stage types:

- `transform`: a snapshot of `state.__xf.stack` and its transform UI
- `effect`: a snapshot of `state.__effects.ui`
- Color mapping is an `effect` with `effectType: "color"` and palette settings in `config.color`. Older `color` stages are migrated when loaded.

Stages can be reordered, disabled, removed, run manually, or reapplied after every visual render. Named flows are saved in browser local storage under `visualHelp.toolFlows.v1`; flow JSON can also be exported and imported. A flow is additionally included in the normal visual settings JSON through `state.__toolFlows`.

## Programmatic interface

```js
import {
  applyToolFlow,
  ensureToolFlowState,
  exportToolFlowToJSON,
  importToolFlowFromJSON,
  setToolFlowStages,
} from "./helper/toolFlowHelp.js";

const flow = ensureToolFlowState(app.state);
setToolFlowStages(app.state, [
  {
    kind: "transform",
    label: "four tiles",
    config: { stack: [{ kind: "split", count: 4 }] },
  },
  {
    kind: "effect",
    label: "grayscale",
    config: {
      effectType: "color",
      color: {
        selector: "path",
        mode: "byLuminance",
        sourceProp: "fill",
        targetProp: "both",
        paletteText: "#111, #777, #eee",
        paletteSteps: 7,
      },
    },
  },
]);

flow.ui.autoRun = true;
applyToolFlow({ mountEl, state: app.state, xfRuntime });
```

The exports deliberately use plain serializable objects so an external tool can construct, inspect, save, or load flows without reaching into the panel DOM.

## Procedural Grass targets

The grass app exposes its parameters through `registerVisual("proceduralGrassField", ...)` and gives generated SVG nodes stable selectors:

- `.grass-blade`
- `.grass-seed-head`
- `.grass-shadow`
- `.grass-ground`
- `.grass-ground-mark`

Each blade also has `data-blade-index`, `data-growth`, `data-height`, and `data-gust` attributes for property- or selector-driven operations.

# Visual UI JSON Export

`helper/visualHelp.js` can export a snapshot of a visual’s UI parameter metadata (key/type/default/min/max/etc) as JSON.

## API

- `exportVisualUIJsonSpec(visualId)` → returns a plain object describing the visual + params.
- `downloadVisualUIJson(visualId)` → triggers a browser download of `<visualId>.ui.json`.
- `registerVisual(id, spec, { exportUIJson: "download" })` → auto-downloads on registration.

## Output File

Browsers cannot write into your repo’s `helper/` folder. Instead, this feature downloads a file that you can move into `helper/` yourself if you want it checked in.

Downloaded filename:

- `<visualId>.ui.json`

## Example (Client-side)

If you have a script that registers visuals, you can enable auto-export:

```js
import { registerVisual } from "./helper/visualHelp.js";

registerVisual("myVisual", {
  title: "My Visual",
  description: "Demo",
  params: [
    { key: "size", type: "number", default: 10, min: 1, max: 100, step: 1, description: "Size" }
  ],
  create: ({ mountEl }, state) => ({ render() {} })
}, { exportUIJson: "download" });
```

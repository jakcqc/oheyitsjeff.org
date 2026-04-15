# Animation Settings JSON (`__anim`)

The Animation tab (`helper/animationHelp.js`) stores its configuration in your visual app’s saved settings under:

- `state.__anim.ui`

When you click “Save Settings”, that JSON is included, so loading a settings file restores the animation configuration.

## Shape

```json
{
  "__anim": {
    "ui": {
      "targetType": "params",
      "paramTargets": [
        { "key": "some.numberParam", "from": 0, "to": 10 }
      ],
      "paramKey": "",
      "selector": "svg",
      "svgKind": "attr",
      "svgName": "opacity",
      "durationSec": 3,
      "fps": 20,
      "easing": "linear",
      "loop": false,
      "yoyo": false,
      "progress01": 0,
      "autoFromCurrent": true,
      "snapToEndOnStop": true
    }
  }
}
```

Only `__anim.ui` is required; the rest of your settings file can include any other visual params (and other tabs like `__xf`, `__propOps`, etc).

## Fields

### Target selection

- `targetType`: `"params"` or `"svg"`

#### Params mode

Animate one or more numeric state params simultaneously.

- `paramTargets`: array of targets:
  - `key`: dot-path into state (e.g. `"needleLen"`, `"view.zoom"`)
  - `from`: number
  - `to`: number
- `paramKey`: legacy field kept for backward compatibility; newer configs should use `paramTargets`.

#### SVG mode

Animate one numeric SVG attribute or style property.

- `selector`: CSS selector relative to the visual mount element (default `"svg"`)
- `svgKind`: `"attr"` or `"style"`
- `svgName`: attribute name (e.g. `"opacity"`, `"r"`) or style property name (e.g. `"stroke-width"`)

### Timing and playback

- `durationSec`: animation duration in seconds
- `fps`: max frames per second (throttle)
- `easing`: `"linear"`, `"easeInOutQuad"`, `"easeInQuad"`, `"easeOutQuad"`
- `loop`: boolean
- `yoyo`: boolean (reverse every other loop)

### UI / convenience

- `progress01`: 0..1 scrubber value (used by the UI)
- `autoFromCurrent`: when adding a param target, seed from/to based on current state
- `snapToEndOnStop`: when stopping, optionally snap to end value

## Example: `helper/animateKakaya.json`

`helper/animateKakaya.json` is a full “settings file” that includes:

- Visual params (top-level keys like `levels`, `copies`, etc)
- `__xf` (Transforms tab)
- `__propOps` (PropOps tab)
- `__anim` (Animation tab)

The animation portion looks like:

```json
{
  "__anim": {
    "ui": {
      "targetType": "params",
      "paramTargets": [
        { "key": "needleThickPx", "from": 0.1, "to": 2 },
        { "key": "needleLen", "from": 0, "to": 2 },
        { "key": "overlap", "from": 0, "to": 1 }
      ],
      "durationSec": 6,
      "fps": 24,
      "easing": "linear",
      "loop": true
    }
  }
}
```

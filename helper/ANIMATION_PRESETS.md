# Animation settings

The shared Animate tab saves its configuration in `state.__anim.ui`, so Save Settings includes the complete flow.

Flow contains the duration in seconds, frame rate, Loop and Yoyo flags, and a list of numeric properties with Start and End values. Add scalar parameters or individual vector components such as `position.x`, `position.y`, and `position.z`. Every property runs together over the same duration. The JSON tab remains available for saved configurations.

```json
{
  "__anim": {
    "ui": {
      "targetType": "params",
      "paramTargets": [
        { "key": "needleLen", "from": 0, "to": 2 },
        { "key": "position.x", "from": -1, "to": 1 }
      ],
      "durationSec": 6,
      "fps": 24,
      "loop": true,
      "yoyo": false,
      "view": "flow"
    }
  }
}
```

Start and Restart immediately apply the configured Start values. Parameters that are absent from the flow keep their current values. An omitted or blank Start uses the property's current value when playback begins. Explicit Start values always take precedence over the legacy `autoFromCurrent` setting.

- **P** starts or pauses animation. Resuming preserves the current progress and endpoints.
- **R** restarts animation from its Start values and runs it.
- **Space** pauses or resumes the visual app's simulation independently of parameter animation.
- **Stop** ends playback while keeping the current values.
- **Loop** repeats the flow. With Loop enabled, **Yoyo** reverses every other pass.
- The progress slider previews the configured flow and can be resumed from that position.

Shortcuts ignore text and number fields, editable content, and modified key presses.

## Saved settings compatibility

Earlier `view: "edit"` values migrate to Flow. Legacy single-property `paramKey`/`from`/`to` configurations migrate to `paramTargets`.

Saved SVG animations remain playable and can be configured through JSON using `targetType: "svg"`, `selector`, `svgKind` (`attr` or `style`), `svgName`, `from`, and `to`.

Legacy easing and autoplay settings remain readable for saved presets and assistant APIs. New flows use linear easing without autoplay. The old Edit area, SVG target editor, capture actions, and extra playback option checkboxes are removed from the interface. `snapToEndOnStop` no longer changes the Stop button's behavior.

The shared `controlAnimation(ctx, command)` API accepts `play`, `pause`, `stop`, `toggle`, and `restart`, and returns `{ playing, paused, progress01 }`.

## Simulation and slider ranges

Developer → Settings contains `shouldRender` and the default-enabled `overrideMinMax` flag. Turning off `shouldRender` destroys the rendered scene; it is separate from Space, which preserves the simulation's current state and pauses its own clock.

With `overrideMinMax` enabled, committing a typed numeric value expands that parameter's slider bounds as needed. Each x/y/z coordinate tracks its own minimum and maximum. Values inside the existing range do not shrink it, and dragging a slider or running an animation does not expand it. Parameters without declared bounds gain a slider after two distinct typed values establish a range.

Learned ranges are stored in `state.__paramRanges` and included in Save Settings, SVG settings, and remembered settings. Disabling the flag restores the declared UI bounds without discarding the saved overrides. Reset Defaults clears the learned ranges. Renderers still enforce their structural limits, such as positive element counts and opacity between zero and one.

Apps connect Space to their native simulation with `simulation: { param: "running" }` in their visual spec. The path must name an existing boolean parameter; `runningValue` defaults to `true`. The framework updates it through the same rendering, history, and persistence path as Params. Apps should preserve simulation progress when that flag changes. `app.toggleSimulation()` uses the same behavior. Static visuals need no simulation mapping.

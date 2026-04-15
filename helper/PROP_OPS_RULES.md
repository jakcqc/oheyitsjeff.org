# Property Ops Rules (PropOps tab)

The PropOps tab lets you add rules that match SVG elements and apply attribute/style patches.



## Rule Shape

```json
{
  "selector": {
    "circle": {
      "r": { "range": [20, 100] }
    }
  },
  "apply": {
    "stroke": null
  }
}
```

- `selector`: object keyed by tag name (e.g. `"circle"`, `"path"`) or `"*"` for any tag.
- `apply`: patch object applied to matching elements.

## Selector Conditions

Each attribute/style key maps to a “condition” that decides whether an element matches.

### Attribute Keys

- `"attrName"`: matches against an SVG attribute (e.g. `"r"`, `"fill"`, `"opacity"`).
- `"style.someProp"`: matches against a style property inside the element’s `style=""` attribute (e.g. `"style.fill"`, `"style.opacity"`).

### Condition Types

#### 1) Exact match

```json
{
  "selector": {
    "path": {
      "fill": "#ff00aa"
    }
  },
  "apply": {
    "stroke": "#000"
  }
}
```

```json
{
  "selector": {
    "*": {
      "style.opacity": 0.5
    }
  },
  "apply": {
    "style.opacity": "1"
  }
}
```

Supported value types for exact match:
- Numbers (or numeric strings like `"12.3"`)
- Strings
- Colors as `"#rrggbb"` / `"#rgb"` or `"rgb(r,g,b)"` / `"rgba(r,g,b,a)"`
- RGB vectors as `[r, g, b]` (0–255)

Examples:
```json
{
  "selector": {
    "rect": {
      "fill": [255, 0, 0]
    }
  },
  "apply": {
    "stroke": "#fff"
  }
}
```

```json
{
  "selector": {
    "rect": {
      "fill": "rgb(255,0,0)"
    }
  },
  "apply": {
    "stroke": "#fff"
  }
}
```

#### 2) Explicit exact match (`eq`)

Same as exact match, but wrapped:

```json
{
  "selector": {
    "*": {
      "fill": { "eq": [255, 0, 0] }
    }
  },
  "apply": {
    "style.stroke-width": "2"
  }
}
```

```json
{
  "selector": {
    "*": {
      "fill": { "eq": "rgb(255,0,0)" }
    }
  },
  "apply": {
    "style.stroke-width": "2"
  }
}
```

#### 3) Numeric range (`range`, `min`, `max`)

For scalar numeric values:

```json
{
  "selector": {
    "*": {
      "opacity": { "range": [0.2, 0.9] }
    }
  },
  "apply": {
    "style.opacity": "1"
  }
}
```

```json
{
  "selector": {
    "circle": {
      "r": { "min": 20, "max": 100 }
    }
  },
  "apply": {
    "stroke": "#0f0"
  }
}
```

#### 4) RGB/vector3 range (`range`, `min`, `max`)

For color values (hex or `rgb(...)`) the matcher compares per-channel ranges.

Accepted formats:

```json
{
  "selector": {
    "*": {
      "fill": { "range": [[0, 0, 0], [64, 64, 64]] }
    }
  },
  "apply": {
    "fill": "#fff"
  }
}
```

```json
{
  "selector": {
    "*": {
      "fill": { "min": [0, 0, 0], "max": [64, 64, 64] }
    }
  },
  "apply": {
    "fill": "#fff"
  }
}
```

Singular “range” means exact match:

```json
{
  "selector": {
    "*": {
      "fill": { "range": [[255, 0, 0]] }
    }
  },
  "apply": {
    "stroke": "#000"
  }
}
```

Notes:
- The element value can be `"#rrggbb"`, `"#rgb"`, `"rgb(r,g,b)"`, or `"rgba(r,g,b,a)"` (alpha is ignored for matching).
- The condition value can be the vector form `[r,g,b]`, hex, or `rgb(...)` string (they’re coerced to `[r,g,b]` internally).

## Apply Patches

`apply` is a mapping from keys to values:

- Setting an attribute to `null` removes it:
```json
{
  "selector": {
    "*": {
      "stroke": { "eq": "#000" }
    }
  },
  "apply": {
    "stroke": null
  }
}
```

- Setting `"style.someProp"` writes into the inline style string:
```json
{
  "selector": {
    "*": {
      "opacity": { "range": [0, 1] }
    }
  },
  "apply": {
    "style.opacity": 0.5
  }
}
```

- Setting `"style"` with an object patches multiple style keys at once:
```json
{
  "selector": {
    "*": {
      "fill": { "eq": "rgb(255,0,0)" }
    }
  },
  "apply": {
    "style": {
      "opacity": "0.5",
      "stroke": null
    }
  }
}
```

- Deleting an element:
```json
{
  "selector": {
    "*": {
      "id": { "eq": "delete-me" }
    }
  },
  "apply": {
    "$delete": true
  }
}
```

Rules live in saved settings at `state.__propOps.stack` and are edited as JSON in the UI (`state.__propOps.ui.ruleText`).
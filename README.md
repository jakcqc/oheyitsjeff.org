# A fun website
Lots of design and professional information 

Visual apps include a local WebLLM chat assistant in the Info toolbar. See the
[assistant setup guide](helper/LLM_ASSISTANT.md) for model downloads, GPU memory
budgets, and structured visual controls.

The shared visual toolbar keeps its vertical tabs, with drag-and-drop splits,
click-to-replace panels, and long-press focus. See the
[toolbar layout guide](helper/TAB_DOCKING.md).

Controls can use [selector-based visibility](helper/CONDITIONAL_CONTROLS.md) to
show only the settings for the selected algorithm or equation.

## Time snapshots

Open **Time** in any shared visual toolbar. Set a grid and use **Take snapshot**
to fill it, then drag snapshots to reorder them. Circle, square, triangle,
polygon, free placement, and custom X/Y/scale functions are also available.
Free placement supports dragging and numeric position/scale controls; formulas
use snapshot order `i` (starting at zero), count `n`, normalized order `t`,
canvas dimensions `W`/`H`, and common math functions.

For animation capture, choose a start time, interval (for example `0.2`
seconds), sample count, and append or replace mode. Enable **Sample next
animation run**, then Play or Restart in Animate. Sampling continues with
Time hidden, pauses with playback, and automatically disarms after that run.
It captures the first rendered frame at or after each requested time; missed
deadlines are skipped instead of duplicating frames. A full grid stops capture.
Replacement happens on the first successful capture, preserving existing
snapshots if the animation ends before the sampling start time.

**Download SVG** saves the composition as one SVG with independent vector
snapshots. Snapshots remain in this page until cleared or reloaded; placement
settings participate in the existing saved settings. Compositions are limited
to 400 snapshots and 32 MiB of SVG text. The export includes placements outside
the canvas and excludes preview guides and selection borders.

Validation: `node --test tests/time-model.mjs tests/time-sampling.mjs`,
`node scripts/test-animation-lifecycle.mjs`, `node tests/time-svg.mjs`, and
`node tests/time-browser.mjs` (the last uses the local preview server).

## Animation rendering

Open **Animate → Render** in a visual app after configuring its animation in
Flow or applying animation JSON. Choose dimensions, duration, finite cycles,
frame ranges, an optional styling flow, and frame labels. Yoyo adds a return
trip to each cycle. Output runs at 24 fps with Odyssey's high-quality H.264
profiles and automatic encoder retries; odd dimensions are padded to even sizes.

**Preload frames** captures a separate snapshot for SVG preview and later reuse.
**Render MP4** prepares frames if needed and opens the completed video in the
simulation area. Choose **Save MP4** to download it or write to a previously
chosen file, or **Discard** to release the preview and temporary files. Nothing
downloads automatically. Preload again after changing the live animation to
capture a new snapshot.

The panel estimates MP4 size, working memory, and render time before starting,
then updates progress and the remaining time for the current phase. These are
estimates: artwork complexity, the device, compression, and retries affect the
result. Cancel remains available in the panel and preview; Escape also cancels.
Browser private storage holds temporary frames and videos where available;
fallback memory caches are limited to 64 MB for SVGs and 256 MB for MP4 output.
Rendering requires a browser with isolated capture support; MP4 also needs H.264
encoding support, as in current desktop Chrome or Edge.
Image to SVG supports animation of the current SVG's attributes and styles;
rendering image-conversion parameters cannot reload an uploaded source image.

Validation: `node --test tests/animation-runtime.mjs tests/animation-render.mjs
tests/animation-render-capture.mjs tests/animation-encode.mjs` and
`node tests/animation-render-browser.mjs`.
The browser checks use the local HTTPS preview server and FFmpeg/ffprobe.

Home and Math Visuals bubbles wait 0.15 seconds and require a small movement before
starting a drag. Moving more than 40 px starts dragging immediately. Change the
shared delay in the footer under **Bubble controls → Drag delay (seconds)**.
Quick presses and slightly shaky taps still open the app.

## License

Copyright (c) 2026 Jeffrey Kerley. See [LICENSE.md](LICENSE.md) for the full terms.

The code is source-available for noncommercial public-source projects and
personal noncommercial experimentation. Paid/commercial applications,
closed-source applications, and AI/ML training are prohibited without separate
written permission. Violating these conditions terminates the user's license.
Third-party materials retain their own licenses.

These restrictions mean this project is **source-available**, rather than open
source under the [Open Source Definition](https://opensource.org/osd).

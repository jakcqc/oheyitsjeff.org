# The odyssey

A static visual app for exploring the parameter spaces of the site's toolbar-integrated visuals. Open `/TheOdyssey/` on the same website as the other apps. Searches, captures, the parameter crawl, and saved-run browsing run in the browser. There is no separate service, port, or runtime installation.

## Search and save

1. The default selects your 20 apps with **256 samples per app** (5,120 runs, two frames each) and broad numeric extensions, up to 2,000% above the declared range. Simulation switches stay fixed at true. Change the app selection and bounds as needed. Parameter minimums affect this only when **Use per-parameter sample minimums** is checked. Full Cartesian grid instead runs every combination of its sampled values.
2. Optionally choose an **output folder**. The browser asks for access to that folder and writes JSON and SVG files directly there. Folder access requires a supporting browser and a secure context; otherwise use the JSON and ZIP downloads.
3. Press **Start search**. Settings and frames are also saved in this browser's IndexedDB library. Pause stops before the next frame; Resume continues; Stop ends the current search. Keep the page open while searching.
4. Select a saved search/run to view its SVG, inspect requested values and errors, download a frame or its settings, or load that search's settings for another run. **Download search ZIP** exports the whole selected search. **Save selected search to folder** copies earlier frames to a connected output folder.

Use **Run number** and **Go to run** (or Enter) to open a specific run, including pending or failed runs. Numbers match the saved run IDs and retain gaps when runs are removed. Choose a **Visual** in the viewer to filter the saved-run list and **Previous run / Next run** navigation to that app. A direct jump uses the run number within the whole search and switches to the destination visual if needed. Changing searches resets the visual filter. Changing runs starts at frame 1; the arrow buttons skip runs without saved frames, which remain available through direct jumps and the list.

Pending runs appear immediately in the list. Use **x** beside a failed, timed-out, stopped, interrupted or pending run (or **x Run** in the viewer) to remove it. Removed pending samples are excluded after resume/reload without changing other samples' settings or seeds. Their saved files are removed from the browser and the connected output folder; reconnect an archive's folder to apply removals made while disconnected. Running and completed runs do not have a removal button. ZIP exports omit removed runs.

**Save settings to disk** writes `odyssey-settings.json` into the selected folder, or downloads that JSON when no folder is connected. Starting a search saves an immutable settings/catalog snapshot. The editor identifies the current storage destination.

After reloading, captured results remain available in this browser. Interrupted searches reopen paused; Resume retries the unfinished run with its saved seed/settings. Reconnect an output folder with **Choose output folder** after reloading to continue disk saves or browse existing archives in it. Browser storage belongs to the current site origin and browser profile, and can be cleared or evicted; use a folder or ZIP to keep a portable copy.

## MP4 export

Choose a saved search, then **Render video** in the viewer or saved-search panel. Choose the visuals, ranges, timing, flow, and label options, then press **Render** once. Rendering, encoder retries, and saving/downloading run automatically without a second export action. Check one, several, or all visuals. The current viewer visual is selected initially. Export uses the saved SVG captures present when the dialog opens, including saved frames from partial or timed-out runs; removed runs and runs with no saved frames are excluded.

**Frame ranges** are inclusive and start at 0 across the selected visuals' saved frames, ordered by run number then saved frame number. Leave blank for all frames, or enter `0-200, 400-560`. Overlapping ranges are deduplicated. These indices refer to saved source images, not the repeated frames in the output video.

**Seconds per saved frame** controls how long each image stays on screen. Output is always 24 fps, so durations round to the nearest 1/24 second; the dialog shows the effective timing and total length. For example, two images at 1.5 seconds each produce a three-second MP4 containing 72 video frames. Export does not rerun or advance the simulations.

**Render flow** lists the shared toolbar library: built-ins and flows saved in this browser. **Keep captured styling** adds no extra flow. The selected flow's stages are copied into the render plan, applied after the saved SVG effects, and kept unchanged through retries even if the library is later edited. The preview identifies the selected flow. Transform, effect, and property stages run through the same shared flow runner as the toolbar, on an isolated SVG copy before rasterization.

The new **No fills + Grayscale** built-in is a reusable three-stage flow: create grayscale outlines from filled artwork, convert remaining strokes to grayscale, then set artwork fills to `none`. It covers inherited/inline fills and shapes referenced through `use`, while preserving clipping and mask geometry. It can be loaded, edited, saved, or exported as flow JSON in the toolbar. Property stages can also capture the current Property Ops rules. Saved captures remain unchanged.

**Show frame number and visual name** adds small white text on a translucent dark background at the bottom right. It includes the original run number, the zero-based frame number used by the export ranges, the visual app name, and the SVG element count (such as `10 elements` or `10k elements`). Counts are taken after the SVG flow, include shapes, text, images, and use instances, and exclude groups and geometry inside definitions, masks, and clipping paths. A use instance counts as one element; counts describe SVG structure, not pixel visibility. The preview caption also shows the exact count. Numbers stay unchanged when ranges omit frames or captures are skipped. Long names are shortened to fit. This option starts off and appears in both the MP4 and its preview.

A live preview appears during export, showing the actual image sent to the encoder, its source frame number and visual, output dimensions, and selected styling. It updates as each usable saved frame is rendered and retains the last image when export finishes or is cancelled. The preview is scaled to fit the dialog; the MP4 keeps the full export resolution. Encoding can run faster than real-time playback.

Each usable SVG is rasterized within the saved search render dimensions, retaining captured effects such as grayscale. Missing, zero, negative, non-finite, or otherwise invalid sizes fall back to a valid viewBox or the search render size. Oversized dimensions are clamped to that render size, and overflowing artwork is cropped. Invalid viewBoxes are repaired. Valid smaller images keep their size and are centered. H.264 requires even dimensions, so an odd width or height gets one extra pixel of padding. Padding and transparent areas are black. Output is H.264 MP4 without audio. Export requests AVC quantizer 16 (the encoder library's very-high-quality setting), quality latency mode, and the detail content hint. QP 0 was removed because some encoders accept that extreme setting during capability checks but fail while encoding. When quantizer control is unsupported, the fallback target is 2 bits per pixel per frame, with a 25 Mbps minimum and no fixed bitrate ceiling: 46.08 Mbps at 1200 by 800, or 99.53 Mbps at 1920 by 1080. This replaces the former 0.2 bits per pixel per frame and 40 Mbps ceiling. Actual file bitrate varies with content and the browser encoder. H.264 remains lossy, including possible color subsampling; this setting does not promise pixel-exact output. Encoder failures automatically restart MP4 encoding with a fresh encoder: first high-bitrate mode without quantizer control, then the same high bitrate with software encoding preferred. There are at most three attempts. Retries keep resolution, 24 fps, ranges, timing, styling, and labels; they reuse the prepared SVG index and rebuild from saved captures without rerunning simulations. A crashed encoder cannot resume its partial MP4. Progress identifies retries and the final status reports which profile succeeded. All failed temporary outputs are discarded, and an existing destination file is replaced only after a complete successful export.

Missing files, malformed SVGs, frames marked as failed, empty geometry, failed image decoding, and images with no visible pixels are skipped. Usable earlier captures from a timed-out run are retained. Frame-range indices stay unchanged, and skipped frames add no time to the video. The completion message reports actual duration, exported frames, skips, and resized frames; expand **Skipped frames** for the reasons. If none of the selected frames are usable, no video is committed. Cancellation, disk errors, and the download memory limit stop immediately. Persistent encoder failures stop after the three attempts and include the failing phase/frame in the error; saved captures remain available.

The default destination is **Automatic download**. When private browser file storage is available, the video streams to a temporary file and automatically downloads on completion, avoiding the in-memory size limit. The temporary file is removed when the result is closed or replaced. Browsers without that storage use a bounded 256 MB memory buffer. **Download again** only repeats an already finished download; no second render/export action is needed.

Optionally use **Choose output file** while configuring options to select a destination in advance. **Render** then writes to it without another picker. **Cancel render** or Escape stops encoding; an existing destination file is committed only after a successful render. Temporary files from failed or cancelled renders are removed. The browser must support H.264 encoding at the selected resolution. Progress stays visible while preparing, encoding, retrying, and finalizing.

The locally bundled [Mediabunny](https://mediabunny.dev/guide/writing-media-files) library writes the MP4. Images are handled one at a time, and no media is uploaded. Its MPL-2.0 license and source notice are in `vendor/mediabunny.LICENSE` and `vendor/mediabunny.NOTICE`.

## Parameters and sampling

**Crawl parameters** visits the bundled app inventory and the website's gallery entries, reading each integrated app's live registered schema. It includes conditional controls, vector axes, descriptions, defaults, options and owning apps. The bundled index contains 29 apps and 657 controls. Failed crawls retain previous controls and report the failure. The updated catalog is saved in the browser and, when connected, the output folder.

Checked parameters vary; unchecked parameters stay at their fixed values. Controls without declared numeric bounds start fixed. Missing source descriptions are identified in the editor. Action buttons are listed but are not sampled. Numeric controls have raw minimum/maximum values, independent below/above extensions, steps, and optional sample minimums. Percentage extensions use the original declared span (or the edited span for an unbounded control); the editor shows both percentages and raw values. Shared UI bounds are bypassed for captures, but source algorithms may apply their own limits.

| Method | Behavior |
| --- | --- |
| Stratified coverage | Independently shuffles one sample from each equal-width interval per parameter. |
| Fully random | Independent uniform draws inside each bound. |
| Small to large | Starts at minima, visits ordered jittered intervals, ends at maxima. |
| Large to small | Reverses the ascending traversal. |
| Large / small / large | Alternates high and low values toward the middle. |
| Low-discrepancy sequence | Seed-shifted Halton sequence across dimensions. |
| Full Cartesian grid | Every combination of evenly spaced numeric values and choice lists. |

Coarse steps and discrete choices can repeat values. The maximum-run limit rejects oversized searches before starting. **New random seed for each search** is enabled by default. Each search saves its generated seed; resume keeps it. To replay a search, load its settings and uncheck that option. The seed controls parameter sampling and initializes a distinct source `Math.random` sequence for each app and sample; source-specific native/async behavior can still affect the image. All 14 explicit seed controls, including nested seeds and those in currently unselected apps, vary across their accepted integer ranges. Seed bounds stay within each app's limits so clamping does not collapse the samples to repeated seeds.

## Toolbar and capture timing

The default applies grayscale on every frame to all painted fills and strokes, with a whole-SVG grayscale filter covering images and gradients too. An ordered flow has an independent 50% chance of enabling the four-tile kaleidoscope preset and a 50% chance of enabling spline lines per run. With 256 stratified samples, each optional stage runs in 128 samples per app. Spline control points, sample density, tension, angle, orientation, length, scale and stroke width vary. Grayscale runs last; no other toolbar effects are enabled. These choices stay consistent across a run's frames and resume.

Use the same transforms, splines/effects, property/script operations and tool-flow tabs as the other visuals. **Capture toolbar setup** copies that configuration into search settings and indexes its numeric fields. Enable effects' auto-run to repeat them on generated frames. Toolbar edits do not change a running search. Saved SVG previews start with an empty tool stack because their search tools are already applied.

Each source runs in an isolated, sandboxed iframe. Captures freeze its JavaScript animation clock between frames; simulation time advances at up to 60 callbacks per simulated second. **Compute deadline** covers source loading and initial rendering. **Frame deadline** covers simulation advancement and SVG capture. Failed/timed-out runs retain earlier frames and the queue continues. Disk-save failures pause the queue so saving can be fixed and retried.

Before executing an app, a short isolation check verifies that the host can run timers while its capture frame is busy. Current desktop Chrome and Edge support this. Browsers without working isolation report a failed run before executing the app. Deadlines belong to the host page: they abort outstanding source loads, reject pending requests, remove the capture, and allow the queue to continue.

The loader fetches scripts on the website origin and creates disposable script copies inside the sandbox, preserving module imports, import maps and native module workers. These copies include real-clock checks in loops and functions so overlong JavaScript unwinds even when the simulation clock is frozen. Original app files are unchanged. The static server does not need CORS headers for local modules. Captures use private, temporary preferences.

Stop removes the capture immediately; JavaScript already executing in its process can take until its current deadline checkpoint to unwind. Native browser operations and dynamically generated code cannot be interrupted by these checkpoints, but remain isolated from the host page. Native CSS animations and independent worker clocks are not frozen.

SVG captures include computed styling and embedded source settings. The voxel apps use their SVG export hook. Image to SVG uses its built-in sample and waits for conversion. Uploaded files and pointer gestures are not copied into captures. SVG Wall is indexed but explicitly reports that its image-preview gallery does not expose a generated SVG. Empty geometric results are saved with a warning; they do not count as a timeout.

## Archive format

```text
odyssey-settings.json
catalog.json                 # after a crawl
search-<timestamp>-<id>/
  settings.json
  manifest.json
  run-000001/
    requested.json
    run.json
    frame-00001.svg
    frame-00001.json
```

`catalog.json` and `default-settings.json` provide the bundled parameter index and settings. The selected preset is maintained in `odyssey-settings-extreme-selected.json`. This preset revision is applied once on the next page load, including browsers with older saved preferences. Previous settings (including a legacy `output/settings.json`, if present) are backed up in IndexedDB under `settings-before-<presetRevision>`. Later edits and imports persist normally. Existing search archives retain their own settings and seeds.

## Developer verification

Running the app requires no npm packages. Playwright is a developer-only test dependency. The integration suite uses a separate, fresh test browser against your existing static website:

```powershell
node tests/odyssey.mjs
node tests/odyssey-source.mjs
node tests/odyssey-defaults.mjs
node tests/odyssey-video.mjs
cd TheOdyssey
npm install
$env:ODYSSEY_TEST_URL='https://127.0.0.1:5500/TheOdyssey/'
npm run test:browser
npm run test:runs
npm run test:timeouts
npm run test:toolbar
npm run test:video
```

The video browser test requires FFmpeg and ffprobe on PATH. It checks the MP4 codec, frame rate, dimensions, exact frame counts and image hold boundaries, visual/range selection, file streaming, cancellation, and mobile layout.

The toolbar checks render all four optional spline/kaleidoscope combinations across successive simulation frames and verify grayscale pixels in captures, including image and gradient content.

The timeout regressions include infinite startup and simulation loops, host responsiveness, preservation of earlier frames, queue continuation, Stop, and native worker captures. The source tests check loop and recursion interruption, labels, strict-mode directives, arrow expressions, and module rewriting. The integration checks exercise two-sample searches, toolbar captures, animated frames, pause/resume, native browser filesystem writes, ZIP downloads, reload recovery, compute/frame deadlines, disk-error retries, source preference isolation and mobile layout. It does not start a backend. Folder writes use the test browser's private filesystem; user folders are untouched.

After updating the checked-in catalog, regenerate defaults from the repository root with `node scripts/build-odyssey-defaults.mjs`. This preserves the selected preset's app selection and expanded bounds, adds any new controls, fixes simulation switches on, and enables sampling for seed controls.

The vendored Acorn parser is used only to prepare capture copies; its MIT license is in `vendor/acorn.LICENSE`. To update it, install the desired dev-dependency version and copy `node_modules/acorn/dist/acorn.mjs` to `vendor/acorn.js`, together with its license.

The MP4 retry tests inject runtime encoder crashes and finalization errors while exporting 1200 by 800 frames, including a 15,039-element SVG. Independent decoding verifies all frames, ordering, and timing after recovery. They also verify the three-attempt limit, software preference, cancellation during retry, disk errors, reuse of the prepared frame index, and preservation of existing destination files. Tests launch a separate headless browser with private storage.

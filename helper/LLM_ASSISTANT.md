# Visual assistant

Open **Info → + → assistant** in a visual app using `helper/visualHelp.js`.
The assistant changes the current visual through validated, structured actions.
It shares the Params, Animate, Effects, and Flows state used by the normal editors.

## Local models

1. Open the assistant. It checks GPU capabilities and exposed memory information
   automatically, then lists compatible models. The memory budget starts on Auto;
   changing it automatically refreshes the list.
2. Choose a model and explicitly load it. The first load downloads model weights;
   later loads can use the browser cache. Use HTTPS or localhost with WebGPU.
3. Ask for a change, such as “animate the radius slowly back and forth” or
   “apply a grayscale color effect.” Choose a specific scope for detailed work.
4. Unload the model when finished to release its worker and GPU resources.

Standard WebGPU exposes adapter features and allocation limits, **not total or
free VRAM**. Auto checks for the optional `memoryHeaps` development extension:
when available, it uses the largest device-local memory heap's capacity. It does
not add host RAM or potentially overlapping heaps, and never treats per-buffer
limits as total VRAM. Without this information, it clearly reports a conservative
**4 GB fallback budget**, not measured capacity. You can override that budget;
for a known 12 GB card, choose 12 GB. An override cannot exceed reported capacity.

The catalog reserves at least 1 GB or 25% of the budget for rendering; a reported
integrated GPU gets a 50% reserve for shared memory. Model estimates include a
4096-token context. Free memory and other applications' usage remain unknown, so
these estimates cannot guarantee a successful load. Try a smaller model or lower
the budget when running demanding visuals or other GPU applications.

For local development in Chrome, `chrome://flags/#enable-webgpu-developer-features`
exposes the experimental memory heap information after restarting the browser.
This is optional and intended for development/testing; the app works without it.
See [Chrome's WebGPU developer documentation](https://developer.chrome.com/docs/web-platform/webgpu/developer-features).

WebLLM is pinned and loaded only inside a dedicated worker when requested.
Model downloads start only when you choose Load. The runtime and model assets
are downloaded from their hosting services; inference runs on your device and
your prompts, chat, and visual settings stay in the browser. This is not a fully
offline installation: uncached runtime or model assets need an internet connection.
The suggested starting model is Qwen 2.5 3B when it fits. Small local models can
misunderstand instructions even with valid JSON; use focused requests and check
the reported changes. The 0.5B option is particularly limited. Larger models may
follow complex instructions better.

## Context and actions

Each request takes a fresh snapshot of the current app's declared UI parameters.
The selected scope adds only the relevant animation, effects, or flow contract.
Recent conversation is bounded, output tokens are capped, and action receipts
are fed back into the conversation. App source files, unrelated apps, full SVG
markup, exported history, and unrelated private state are excluded.

Auto chooses one tool scope from the request. For work spanning animation and
flows, use separate requests or select the scope explicitly. Large control lists
are shortened to relevant parameters when needed, with omissions marked in the
model context. Token counts before generation are estimates.

The response contains a short message and an array of allowlisted actions.
All actions are validated before execution: declared parameter keys, types,
ranges and choices; numeric animation targets; supported effect settings; and
supported flow stages. Generated JavaScript, script operations, and arbitrary
state paths are not accepted. Effects operate on the current visual mount.
Editors refresh after changes; the assistant's Undo control uses the shared
visual undo history.

Animation currently targets numeric app parameters. Effects support paint,
scale, shape conversion, spline lines, and color mapping. Flows combine those
effects with split, rotate, zoom, flip, and translate stages. Code editors,
generated functions, SVG attribute animation, and file/export actions remain
manual controls.

The local model client is in `llmLocal.js`, the worker runtime in
`llmWorker.js`, context/schema/action handling in `llmTools.js`, and chat UI in
`llmTab.js`. New visual apps using `registerVisual` and `runVisualApp` receive
the assistant automatically. Standalone legacy pages without the shared toolbar
need to adopt that interface first.

## Toolbar settings

The final **developer** tab contains Settings, propOps, and autoExport. Settings
includes JSON save/load, reset, settings import from SVG, category defaults,
remember settings, and the available pin/navigation controls. The compact footer
contains only **Save** and **Load** for SVG files. New visuals start with categories
collapsed and settings remembered; an explicitly saved preference is preserved.

## Verification

Run the local client and tool unit tests with:

```sh
node --experimental-default-type=module --test tests/llm-local.mjs tests/llm-tools.mjs
```

Serve the repository and open `tests/panel-regressions.html` for existing toolbar
regressions and `tests/assistant-regressions.html` for assistant integration checks.
The assistant checks use a simulated local worker and do not download a model.
During implementation, Qwen 2.5 3B also completed real
WebGPU requests to change a Voronoi parameter, apply a five-step grayscale
effect, and start a numeric parameter animation.
Real inference needs a supported WebGPU browser and a downloaded model.

## References

- [WebLLM usage and workers](https://webllm.mlc.ai/docs/user/basic_usage.html)
- [WebGPU adapter information](https://gpuweb.github.io/types/interfaces/GPUAdapterInfo.html)

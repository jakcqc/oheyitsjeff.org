# Visual assistant

Open **Info → + → assistant** in a visual app using `helper/visualHelp.js`.
The assistant changes the current visual through validated, structured actions.
It shares the Params, Animate, Transforms, Effects, and Flows state used by the normal editors.

## Local models

1. Open the assistant. It checks GPU capabilities and exposed memory information
   automatically, then lists compatible models. The memory budget starts on Auto;
   changing it automatically refreshes the list. Expand **GPU details** to see
   the detected adapter, memory fallback, and rendering reserve.
2. Choose a **Quantization level** (all compatible levels, 4-bit, 16-bit, or
   32-bit), then choose a model and format. This lets you compare a smaller
   full-precision model with a larger compressed model on the same GPU.
   Each format shows its estimated GPU footprint. Only compatible models and
   formats are shown. Explicitly load the selected format; the first load
   downloads its weights, and later loads can use the browser cache.
   Use HTTPS or localhost with WebGPU.
3. Ask for a change, such as “animate the radius slowly back and forth” or
   “apply a grayscale color effect.” Choose a specific scope for detailed work.
   Reply text appears as the model generates it. Changes apply after the complete
   response passes validation. Stop discards the pending response and releases
   the worker; reload the model to start again.
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
4096-token context. Only models using **30 GB or less of estimated GPU memory**
are considered, even on a larger GPU or with a higher manual budget. This is a
model memory cap, not a parameter count or download size. The GPU check still
filters by the remaining budget, `shader-f16` support, and each model's minimum
individual buffer size. Free memory and other applications' usage remain unknown, so
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
The catalog includes Qwen 3.5 (0.8B, 2B, 4B, 9B), Qwen 3 (0.6B, 1.7B, 4B, 8B),
Phi 4 Mini, and Ministral 3 3B Instruct, alongside Qwen 2.5, Llama 3.2, and tiny
SmolLM2 135M/360M options. These exact model IDs and memory estimates were checked against
[WebLLM 0.2.85's published catalog](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts)
on October 1, 2026. Discovery uses a local snapshot; it does not query a remote
catalog or automatically upgrade the runtime. The suggested starting model is
Qwen 3.5 4B when it fits, then 2B or 0.8B on smaller GPUs. Existing compatible
selections are preserved when you repeat the GPU check. Small local models can
misunderstand instructions even with valid JSON; use focused requests and check
the reported changes. The 0.5B option is particularly limited. Larger models may
follow complex instructions better. Qwen 3 and 3.5 run with thinking disabled for
the assistant's structured JSON responses. The worker removes only WebLLM's
empty thinking prefix; action validation still rejects other non-JSON output.

### Quantization and memory

The quantization-level selector filters models by weight precision. Its choices
come from formats that pass the GPU feature, buffer, and memory checks. The
model selector then groups the remaining formats by model family, and the cards
show each compatible format's memory footprint:

- **4-bit weights · FP16 compute**: compressed 4-bit weights with half-precision computation.
- **4-bit weights · FP32 compute**: still 4-bit weights, with single-precision computation.
  This also works on GPUs without `shader-f16` when their other limits allow it.
- **16-bit / 32-bit · unquantized**: larger builds available for selected models.

Qwen 3.5 **2B** currently has only `q4f16_1` and `q4f32_1` builds in the pinned
browser catalog. Both have **4-bit weights**; FP16 and FP32 are compute precision,
not two weight quantization levels. Their estimates are 2.19 GB and 2.53 GB.
The family note explains this in the toolbar. Select the 16-bit or 32-bit weight
level to see compatible full-precision models, including Qwen 3.5 0.8B at FP16.
Verified again on October 2, 2026 against the
[published catalog](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts)
and the official [FP16-compute](https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f16_1-MLC/blob/main/mlc-chat-config.json)
and [FP32-compute](https://huggingface.co/mlc-ai/Qwen3.5-2B-q4f32_1-MLC/blob/main/mlc-chat-config.json) configurations.

For example, Qwen 3 0.6B has these estimates at the same 4,096-token context:

| Format | Estimated GPU memory |
| --- | ---: |
| 4-bit weights, FP16 compute | 1.37 GB |
| 4-bit weights, FP32 compute | 1.88 GB |
| 16-bit unquantized | 2.17 GB |
| 32-bit unquantized | 3.75 GB |

These estimates come from WebLLM's catalog, not a parameter-count formula or a
download size. Format-specific buffers are checked against the decoded tensor
sizes; compressed download storage can be smaller than the required GPU buffer.
The default is the smallest compatible 4-bit build. Changing a format does not
download it. Load the new format before sending a message; returning to the
already loaded format lets you keep using it. A GPU recheck preserves the chosen
weight level and format when they still fit. If a format stops fitting, the
selected level chooses a smaller compatible model; if the whole weight level
becomes unavailable, the selector returns to all compatible levels. Incompatible
formats are hidden. The client repeats its GPU checks before loading a model.

The catalog contains 45 builds across 18 model families. Unquantized builds are
available for Qwen 3.5 0.8B (FP16), Qwen 3 0.6B (FP16/FP32), Llama 3.2 1B
(FP16/FP32), Qwen 2.5 0.5B (FP16/FP32), and SmolLM2 135M/360M (FP16/FP32).
The tiny SmolLM2 models are limited instruction followers; check their results.
Other formats are shown only when
the pinned runtime publishes compatible model libraries and memory estimates.
The current published browser libraries offer no Q5/Q6/Q8 formats; their Q3
Llama 70B builds exceed the 30 GB cap.

### Latest-model check

An October 1, 2026 search checked current releases against the
[latest stable WebLLM release](https://github.com/mlc-ai/web-llm/releases/tag/v0.2.85).
Newer models such as [Qwen 3.8 27B](https://huggingface.co/Qwen/Qwen3.8-27B) and
[Gemma 4 12B](https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemma-4-12B/)
are available for local inference, but are absent from that release's browser
catalog. They need a verified compatible browser model library or a different
runtime before they can be offered here. The current assistant continues to use
the supported Qwen 3.5, Qwen 3, Phi 4 Mini, and Ministral 3 builds listed above.

## Context and actions

Each request takes a fresh snapshot of the current app's declared UI parameters.
The selected scope adds only the relevant animation, transforms, effects, or flow contract.
Recent conversation is bounded, output tokens are capped, and action receipts
are fed back into the conversation. App source files, unrelated apps, full SVG
markup, exported history, and unrelated private state are excluded.

Auto chooses one tool scope from the request. For work spanning animation and
flows, use separate requests or select the scope explicitly. Large control lists
are shortened to relevant parameters when needed, with omissions marked in the
model context. Token counts before generation are estimates.

The response contains a short message and an array of allowlisted actions.
WebLLM streams response deltas through the dedicated worker. The chat previews
the message as plain text, including safely decoded split JSON escape sequences.
It does not execute partial actions. Truncated, cancelled, or invalid responses
apply no changes, and late worker chunks are ignored. The final usage chunk
supplies input and output token counts. Completed replies replace the preview
with an action receipt.
All actions are validated before execution: declared parameter keys, types,
ranges and choices; numeric animation targets; toolbar transform settings and
operations; supported effect settings; and supported flow stages. Generated JavaScript, script operations, and arbitrary
state paths are not accepted. Effects operate on the current visual mount.
Editors refresh after changes; the assistant's Undo control uses the shared
visual undo history.

Transforms can configure and apply split copies, tile targets, rotation, flips,
zoom and its center, translation, affine matrices, stacked 3D planes, and the
built-in presets. Stack undo and reset are also available. These actions use
the same transform state and renderer as the Transforms tab. A transform action
includes its settings and operation together so a model can apply a rotation
in one action. A separate configure option supports requests to edit settings
without applying them. An automatic flow
containing transform stages is paused when applying toolbar transforms so it
cannot overwrite the requested stack; the receipt reports that change.

Animation currently targets numeric app parameters. Effects support paint,
scale, shape conversion, spline lines, and color mapping. Flows combine those
effects with split, rotate, zoom, flip, and translate stages. Code editors,
generated functions, SVG attribute animation, and file/export actions remain
manual controls.

The catalog, runtime version, and memory cap are in `llmModels.js`. Keep the
snapshot in sync with the pinned runtime when updating it; the worker checks
the selected model's published memory estimate again before loading it.
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
node --experimental-default-type=module --test tests/llm-local.mjs tests/llm-tools.mjs tests/llm-stream.mjs
```

Serve the repository and open `tests/panel-regressions.html` for existing toolbar
regressions and `tests/assistant-regressions.html` for assistant integration checks.
The assistant checks use a simulated local worker and do not download a model.
They verify live streamed text before completion, cancellation, and real state,
rendered SVG, and toolbar controls after parameter, animation, transform, and
flow actions. The worker tests exercise streamed completion and usage chunks,
split Qwen prefixes, and interrupted responses.
Earlier validation with Qwen 2.5 3B also completed real
WebGPU requests to change a Voronoi parameter, apply a five-step grayscale
effect, and start a numeric parameter animation.
On October 2, 2026, real Qwen 3.5 2B inference verified progressively streamed
reply text, a seed parameter update to 42, and a 30-degree rotation on all tiles
with matching toolbar controls. The combined transform action was checked with
the ordinary prompt “Rotate the visual 30 degrees for all tiles.”
Real inference needs a supported WebGPU browser and a downloaded model.
Full-precision model variants were checked against published model metadata,
worker simulations, and browser interactions; their inference was not run.

## References

- [WebLLM usage and workers](https://webllm.mlc.ai/docs/user/basic_usage.html)
- [WebGPU adapter information](https://gpuweb.github.io/types/interfaces/GPUAdapterInfo.html)

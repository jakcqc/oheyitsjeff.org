/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * See LICENSE.md at the repository root for the full terms.
 */

export const WEBLLM_VERSION = '0.2.85';
export const WEBLLM_URL = `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/+esm`;
export const MODEL_CONTEXT_TOKENS = 4096;
export const MAX_MODEL_VRAM_MB = 30 * 1024;

// Verified against the published runtime's prebuiltAppConfig on 2026-10-01:
// https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts
// These are GPU memory estimates at a 4096-token context, not download sizes.
// Keep the snapshot and runtime version together; discovery downloads nothing.
// Only instruction/chat models suitable for structured actions are included.
// Last column: largest decoded tensor allocation in each model's tensor-cache.json,
// e.g. https://huggingface.co/mlc-ai/Qwen3.5-9B-q4f16_1-MLC/resolve/main/tensor-cache.json
// Both precisions share these packed-weight sizes. These are necessary buffer
// minima, not measurements of VRAM or guarantees about temporary allocations.
const MODEL_FAMILIES = [
  ['Qwen3.5-0.8B', 'Qwen 3.5 0.8B · compact', 1629.49, 1894.19, 127139840],
  ['Qwen3.5-2B', 'Qwen 3.5 2B', 2245.44, 2591.55, 254279680],
  ['Qwen3.5-4B', 'Qwen 3.5 4B', 3867.82, 4680.36, 317849600],
  ['Qwen3.5-9B', 'Qwen 3.5 9B · more capable', 6433.01, 7544.74, 508559360],
  ['Qwen3-0.6B', 'Qwen 3 0.6B · compact', 1403.34, 1924.98, 77791232],
  ['Qwen3-1.7B', 'Qwen 3 1.7B', 2036.66, 2635.44, 155582464],
  ['Qwen3-4B', 'Qwen 3 4B', 3431.59, 4327.71, 194478080],
  ['Qwen3-8B', 'Qwen 3 8B', 5695.78, 6852.55, 311164928],
  ['Phi-4-mini-instruct', 'Phi 4 Mini', 3437.58, 4220.59, 307298304],
  ['Ministral-3-3B-Instruct-2512-BF16', 'Ministral 3 3B Instruct', 2863.69, 3532.37, 201326592],
  ['Qwen2.5-0.5B-Instruct', 'Qwen 2.5 0.5B · smallest', 944.62, 1060.2, 68067328],
  ['Llama-3.2-1B-Instruct', 'Llama 3.2 1B', 879.04, 1128.82, 131334144],
  ['Qwen2.5-1.5B-Instruct', 'Qwen 2.5 1.5B', 1629.75, 1888.97, 116686848],
  ['Llama-3.2-3B-Instruct', 'Llama 3.2 3B', 2263.69, 2951.51, 197001216],
  ['Qwen2.5-3B-Instruct', 'Qwen 2.5 3B', 2504.76, 2893.64, 155582464],
  ['Qwen2.5-7B-Instruct', 'Qwen 2.5 7B', 5106.67, 5900.09, 272498688],
  ['SmolLM2-360M-Instruct', 'SmolLM2 360M · tiny', 376.06, 579.61, 23592960],
];

const QUANTIZED_MODELS = MODEL_FAMILIES.flatMap(([base, label, half, full, bufferBytes]) =>
  [[16, half], [32, full]].map(([precision, vramMB]) => ({
    id: `${base}-q4f${precision}_1-MLC`, label, familyId: base,
    quantization: `q4f${precision}_1`, weightBits: 4,
    vramMB: Math.ceil(vramMB), contextTokens: MODEL_CONTEXT_TOKENS,
    requiredFeatures: precision === 16 ? ['shader-f16'] : [],
    requiredBufferBytes: Math.max(128 * 1024 * 1024, bufferBytes),
    precision,
  })));

// Only q0 variants with published WebLLM model libraries are selectable.
// A q0 build uses unquantized weights at its compute precision. For q0f32,
// tensor-cache.json stores some tensors as f32-to-bf16: the GPU allocation
// is shape * dtype bytes, not the smaller serialized nbytes value.
const UNQUANTIZED_MODELS = [
  ['Qwen3.5-0.8B', 16, 2660.27, 508559360],
  ['Qwen3-0.6B', 16, 2220.38, 311164928],
  ['Qwen3-0.6B', 32, 3843.25, 622329856],
  ['Llama-3.2-1B-Instruct', 16, 2573.13, 525336576],
  ['Llama-3.2-1B-Instruct', 32, 5106.26, 1050673152],
  ['Qwen2.5-0.5B-Instruct', 16, 1624.12, 272269312],
  ['Qwen2.5-0.5B-Instruct', 32, 2654.75, 544538624],
  ['SmolLM2-360M-Instruct', 16, 871.99, 94371840],
  ['SmolLM2-360M-Instruct', 32, 1743.99, 188743680],
  // The runtime publishes only q0 entries for the 135M instruction model.
  ['SmolLM2-135M-Instruct', 16, 359.69, 56623104, 'SmolLM2 135M · tiny'],
  ['SmolLM2-135M-Instruct', 32, 719.38, 113246208, 'SmolLM2 135M · tiny'],
].map(([familyId, precision, vramMB, bufferBytes, label]) => ({
  id: `${familyId}-q0f${precision}-MLC`, familyId,
  label: label || MODEL_FAMILIES.find(([base]) => base === familyId)[1],
  quantization: `q0f${precision}`, weightBits: precision, precision,
  vramMB: Math.ceil(vramMB), contextTokens: MODEL_CONTEXT_TOKENS,
  requiredFeatures: precision === 16 ? ['shader-f16'] : [],
  requiredBufferBytes: Math.max(128 * 1024 * 1024, bufferBytes),
}));

export const LOCAL_MODELS = [...QUANTIZED_MODELS, ...UNQUANTIZED_MODELS];

export function formatQuantization(model) {
  return model.weightBits === 4
    ? `4-bit weights \u00b7 FP${model.precision} compute`
    : `${model.weightBits}-bit \u00b7 unquantized`;
}

export function recommendModelVariant(models) {
  // The caller has already checked GPU features, buffers, and memory budget.
  return [...models].sort((a, b) =>
    Number(b.weightBits === 4) - Number(a.weightBits === 4)
    || a.vramMB - b.vramMB)[0];
}

export function isModelWithinBudget(vramMB, availableMB = Infinity) {
  return Number.isFinite(vramMB) && vramMB > 0
    && vramMB <= MAX_MODEL_VRAM_MB && vramMB <= availableMB;
}

export function recommendLocalModel(models) {
  // A balanced starting download; larger compatible models remain selectable.
  for (const base of ['Qwen3.5-4B', 'Qwen3.5-2B', 'Qwen3.5-0.8B',
    'Qwen3-4B', 'Qwen3-1.7B', 'Qwen3-0.6B', 'Qwen2.5-3B-Instruct', 'Qwen2.5-1.5B-Instruct']) {
    const model = recommendModelVariant(models.filter(item => item.familyId === base));
    if (model) return model;
  }
  return [...models].sort((a, b) => a.vramMB - b.vramMB)[0];
}

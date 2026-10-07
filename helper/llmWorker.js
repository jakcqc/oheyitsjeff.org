/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

// This module and the runtime are loaded only after an explicit Load action.
// Running the engine here keeps model compilation and inference off the UI thread.
import { WEBLLM_URL, MODEL_CONTEXT_TOKENS, isModelWithinBudget } from './llmModels.js';
let engine;
let loadedModelId = '';
let busy = false;

self.onmessage = async ({ data }) => {
  const { id, kind, modelId, messages, schema, maxTokens } = data || {};
  if (busy || !['load', 'complete'].includes(kind)) {
    self.postMessage({ id, error: 'failed' });
    return;
  }
  busy = true;
  try {
    if (kind === 'load') {
      const webllm = await import(WEBLLM_URL);
      const record = webllm.prebuiltAppConfig.model_list.find(model => model.model_id === modelId);
      if (!record || !isModelWithinBudget(record.vram_required_MB)) throw new Error('Unsupported model or memory requirement');
      engine = new webllm.MLCEngine({
        appConfig: { ...webllm.prebuiltAppConfig, model_list: [record] },
        logLevel: 'ERROR',
        initProgressCallback: progress => self.postMessage({ id, kind: 'progress', progress }),
      });
      await engine.reload(modelId, { context_window_size: MODEL_CONTEXT_TOKENS });
      loadedModelId = modelId;
      self.postMessage({ id, result: { loaded: true } });
    } else {
      if (!engine) throw new Error('Model not loaded');
      // response_format supplies a token grammar, not instructions to the model.
      // The request builder already counts this schema in its context budget.
      const localMessages = messages.map(message => ({ ...message }));
      const schemaInstruction = `Allowed response JSON schema: ${JSON.stringify(schema)}`;
      const systemMessage = localMessages.find(message => message.role === 'system');
      if (systemMessage) systemMessage.content += `\n${schemaInstruction}`;
      else localMessages.unshift({ role: 'system', content: schemaInstruction });
      const supportsThinking = /^Qwen3(?:\.5)?-/.test(loadedModelId);
      const chunks = await engine.chat.completions.create({
        messages: localMessages, max_tokens: maxTokens, temperature: 0.2,
        stream: true, stream_options: { include_usage: true },
        response_format: { type: 'json_object', schema: JSON.stringify(schema) },
        ...(supportsThinking ? { extra_body: { enable_thinking: false } } : {}),
      });
      let rawContent = '';
      let content = '';
      let emittedLength = 0;
      let finishReason = null;
      let usage = null;
      for await (const chunk of chunks) {
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        // WebLLM sends usage after the finish chunk, with no choices.
        if (chunk.usage) usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
        };
        if (typeof choice?.delta?.content !== 'string') continue;
        rawContent += choice.delta.content;
        if (rawContent.length > 65536) throw new Error('Response too large');
        // With thinking disabled, Qwen can still prepend an empty thinking
        // block. Wait across chunk boundaries for JSON and remove only that
        // exact empty prefix. Nonempty reasoning never reaches the UI.
        content = supportsThinking
          ? rawContent.replace(/^<think>\s*<\/think>\s*/, '')
          : rawContent;
        if (!content.trimStart().startsWith('{')) continue;
        const delta = content.slice(emittedLength);
        if (delta) self.postMessage({ id, kind: 'token', delta });
        emittedLength = content.length;
      }
      if (finishReason !== 'stop') {
        self.postMessage({ id, error: 'incomplete' });
      } else if (!content.trimStart().startsWith('{')) {
        self.postMessage({ id, error: 'invalid' });
      } else {
        self.postMessage({ id, result: { content, usage } });
      }
    }
  } catch {
    self.postMessage({ id, error: 'failed' });
  } finally {
    busy = false;
  }
};

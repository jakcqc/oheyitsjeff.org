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
const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
let engine;
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
      if (!record) throw new Error('Unknown model');
      engine = new webllm.MLCEngine({
        appConfig: { ...webllm.prebuiltAppConfig, model_list: [record] },
        logLevel: 'ERROR',
        initProgressCallback: progress => self.postMessage({ id, kind: 'progress', progress }),
      });
      await engine.reload(modelId, { context_window_size: 4096 });
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
      const response = await engine.chat.completions.create({
        messages: localMessages, max_tokens: maxTokens, temperature: 0.2,
        response_format: { type: 'json_object', schema: JSON.stringify(schema) },
      });
      const choice = response.choices?.[0];
      if (choice?.finish_reason !== 'stop') {
        self.postMessage({ id, error: 'incomplete' });
      } else {
        self.postMessage({ id, result: {
          content: choice.message?.content,
          usage: response.usage ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          } : null,
        } });
      }
    }
  } catch {
    self.postMessage({ id, error: 'failed' });
  } finally {
    busy = false;
  }
};

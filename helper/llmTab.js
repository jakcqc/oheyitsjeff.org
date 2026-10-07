/*!
 * Copyright (c) 2026 Jeffrey Kerley.
 * SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0
 * Source-available for noncommercial public-source projects.
 * No AI/ML training. No paid/commercial or closed-source application use.
 * Personal noncommercial experimentation is permitted.
 * Violating these conditions terminates permission under this license.
 * See LICENSE.md at the repository root for the full terms.
 */

import { el, registerTab } from "./visualHelp.js";
import { LocalLLMClient } from "./llmLocal.js";
import { LOCAL_MODELS, MAX_MODEL_VRAM_MB, recommendLocalModel, recommendModelVariant, formatQuantization } from "./llmModels.js";
import { buildAssistantRequest, applyAssistantActions } from "./llmTools.js";
import { streamedAssistantMessage } from "./llmStream.js";

// Conversation stays in memory, separate from exported/saved visual state.
const sessions = new WeakMap();
const HISTORY_LIMIT = 12;
const CHAT_LIMIT = 24;
const HISTORY_CHAR_LIMIT = 12000;
let nextQuantizationGroup = 0;

function trimHistory(history) {
  let total = 0;
  return history.slice(-HISTORY_LIMIT).reverse().filter(message => {
    total += message.content.length;
    return total <= HISTORY_CHAR_LIMIT;
  }).reverse();
}

function field(label, control, help) {
  control.setAttribute("aria-label", label);
  const wrapper = el("label", { className: "llm-field" }, [
    el("span", { className: "llm-label", textContent: label }), control,
  ]);
  if (help) wrapper.append(el("span", { className: "llm-help", textContent: help }));
  return wrapper;
}

function option(value, label) {
  return el("option", { value, textContent: label });
}

function button(label, extra = {}) {
  return el("button", { type: "button", textContent: label, "aria-label": label, ...extra });
}

export function buildLLMTab(ctx) {
  const session = sessions.get(ctx.state) || { history: [], chat: [] };
  sessions.set(ctx.state, session);
  const client = new LocalLLMClient();
  let busy = "";
  let destroyed = false;
  let controller = null;
  let modelsFound = false;
  let checkedVariants = [];
  let selectedModelId = "";
  const quantizationGroup = `llm-quantization-${++nextQuantizationGroup}`;

  const root = el("section", { className: "llm-tab", "aria-label": "Visual assistant" });
  const budget = el("select", {}, [option("auto", "Auto · check GPU memory"), ...[2, 4, 6, 8, 12, 16, 24, 32, 48, 64].map(gb => option(String(gb), `${gb} GB`))]);
  budget.value = "auto";
  const findBtn = button("Check GPU / Find models");
  const gpuNote = el("p", {
    className: "llm-help",
    textContent: "Checking GPU capabilities and memory information…",
  });
  const gpuSummary = el("summary", { textContent: "Checking GPU…" });
  const gpuDetails = el("details", { className: "llm-gpu-details" }, [gpuSummary, gpuNote]);
  const quantizationLevel = el("select", { disabled: true }, [option("all", "All levels that fit")]);
  const levelSummary = el("p", { className: "llm-help", "aria-live": "polite" });
  const localModel = el("select", { disabled: true }, [option("", "Checking GPU…")]);
  const quantizationChoices = el("div", { className: "llm-quantization-choices" });
  const quantizationNote = el("p", { className: "llm-help llm-quantization-note" });
  const quantizationHelp = el("p", { className: "llm-help", textContent: "4-bit compresses model weights. FP16 / FP32 on a 4-bit option is compute precision. 16-bit and 32-bit weight options are unquantized. Only formats that pass the GPU check are shown." });
  const quantization = el("fieldset", { className: "llm-quantization", "aria-label": "Quantization", disabled: true }, [
    el("legend", { className: "llm-label", textContent: "Quantization · estimated GPU memory" }),
    quantizationChoices,
    quantizationNote,
    quantizationHelp,
  ]);
  const loadBtn = button("Load / download model");
  const unloadBtn = button("Unload model");
  const progress = el("progress", { max: 1, value: 0, hidden: true, "aria-label": "Model download and initialization" });
  const modelStatus = el("p", { className: "llm-help", textContent: "No model loaded. Downloads only start when you choose Load / download model." });
  const localSettings = el("div", { className: "llm-settings" }, [
    field("GPU memory budget", budget), findBtn, gpuDetails,
    field("Quantization level", quantizationLevel, "Choose a smaller full-precision model or a larger compressed model. Each level lists only models that fit your GPU."), levelSummary,
    field("Local model · estimated GPU memory", localModel), quantization,
    el("p", { className: "llm-help", textContent: `Estimates include a 4,096-token context. Models up to ${MAX_MODEL_VRAM_MB / 1024} GB are considered; the GPU check reserves memory for rendering. Downloads start only when you load a model.` }),
    el("div", { className: "llm-actions" }, [loadBtn, unloadBtn]), progress, modelStatus,
  ]);

  const scope = el("select", {}, [
    option("auto", "Auto · relevant controls only"), option("params", "Parameters"),
    option("animation", "Animation"), option("transforms", "Transforms"), option("effects", "Effects"), option("flows", "Flows"),
  ]);
  const chat = el("div", { className: "llm-chat", role: "log", "aria-label": "Assistant conversation", "aria-live": "polite", "aria-relevant": "additions" });
  const input = el("textarea", {
    className: "llm-input", rows: 3, maxlength: 2400,
    placeholder: "Describe the change you want…", "aria-label": "Message to visual assistant",
  });
  const sendBtn = button("Send", { className: "llm-send" });
  const stopBtn = button("Stop", { disabled: true });
  const clearBtn = button("Clear chat");
  const undoBtn = button("Undo last visual change", { title: "Uses the visual’s shared undo history" });
  const status = el("p", {
    className: "llm-status", role: "status", "aria-live": "polite",
    textContent: "Checking your GPU automatically…",
  });
  const contextInfo = el("p", { className: "llm-help llm-context", textContent: "The assistant reads current controls when you send. Validated changes apply immediately; use Undo to revert. Only a short recent history is included." });
  const examples = el("div", { className: "llm-examples", "aria-label": "Example prompts" });
  for (const text of ["What can I change?", "Animate one parameter slowly", "Rotate the visual 30 degrees", "Apply a grayscale color effect", "Create a rotate-and-color flow"]) {
    examples.append(button(text, { onclick: () => { input.value = text; syncControls(); input.focus(); } }));
  }

  root.append(
    el("h3", { className: "llm-heading", textContent: "Shape this visual with a conversation" }),
    el("p", { className: "llm-help", textContent: "Powered by WebLLM on your device. Your prompts and visual settings stay in this browser. Loading the runtime and model requires an internet connection; inference runs locally on your GPU." }),
    localSettings,
    field("Control scope", scope), contextInfo, chat, examples, input,
    el("p", { className: "llm-help", textContent: "Ctrl / ⌘ + Enter to send. Responses may be imperfect; changes are checked against this app’s controls." }),
    el("div", { className: "llm-actions" }, [sendBtn, stopBtn, clearBtn, undoBtn]), status,
  );

  function setStatus(text, error = false) {
    if (destroyed) return;
    status.textContent = text;
    status.classList.toggle("llm-error", error);
  }

  function errorText(error) {
    return String(error?.message || error || "Request failed").slice(0, 1200);
  }

  function renderChat() {
    chat.replaceChildren();
    if (!session.chat.length) {
      chat.append(el("p", { className: "llm-empty", textContent: "Ask about the available controls or describe a change to this visual." }));
      return;
    }
    for (const message of session.chat) {
      const bubble = el("div", { className: `llm-message llm-message-${message.role}` });
      bubble.append(
        el("strong", { textContent: message.role === "user" ? "You" : message.role === "error" ? "Request failed" : "Assistant" }),
        el("div", { className: "llm-message-text", textContent: message.content }),
      );
      if (message.summary?.length) bubble.append(el("ul", { className: "llm-receipt" }, message.summary.map(text => el("li", { textContent: text }))));
      else if (message.role === "assistant") bubble.append(el("p", { className: "llm-help", textContent: "No changes were applied." }));
      chat.append(bubble);
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function addChat(message) {
    session.chat.push(message);
    session.chat = session.chat.slice(-CHAT_LIMIT);
    renderChat();
  }

  function modelsAtSelectedLevel() {
    return checkedVariants.filter(model => quantizationLevel.value === "all"
      || String(model.weightBits) === quantizationLevel.value);
  }

  function renderModelChoices(previousFamily = localModel.value, previousVariant = selectedModelId) {
    const models = modelsAtSelectedLevel();
    const recommended = recommendLocalModel(models);
    const families = new Map();
    for (const model of models) {
      if (!families.has(model.familyId)) families.set(model.familyId, []);
      families.get(model.familyId).push(model);
    }
    modelsFound = families.size > 0;
    localModel.replaceChildren(option("", modelsFound ? "Choose a model" : "No compatible models for this budget"));
    for (const [familyId, variants] of families) {
      const smallest = Math.min(...variants.map(model => model.vramMB));
      const largest = Math.max(...variants.map(model => model.vramMB));
      const memory = smallest === largest ? `~${(smallest / 1024).toFixed(2)} GB`
        : `~${(smallest / 1024).toFixed(2)}–${(largest / 1024).toFixed(2)} GB`;
      localModel.append(option(familyId, `${variants[0].label} · ${memory}${familyId === recommended?.familyId ? " · suggested" : ""}`));
    }
    if (modelsFound) localModel.value = families.has(previousFamily) ? previousFamily : recommended.familyId;
    renderQuantization(previousVariant);
  }

  function renderQuantization(preferredId = "") {
    const variants = modelsAtSelectedLevel().filter(model => model.familyId === localModel.value);
    const published = LOCAL_MODELS.filter(model => model.familyId === localModel.value);
    quantizationNote.textContent = published.length && published.every(model => model.weightBits === 4)
      ? `${published[0].label} has 4-bit weights in the supported browser builds. FP16 and FP32 describe compute precision. Choose the 16-bit or 32-bit weight level above to see full-precision models that fit your GPU.`
      : "";
    quantizationNote.hidden = !quantizationNote.textContent;
    quantizationHelp.hidden = !quantizationNote.hidden;
    const suggested = recommendModelVariant(variants);
    selectedModelId = variants.find(model => model.id === preferredId)?.id || suggested?.id || "";
    quantizationChoices.replaceChildren();
    if (!variants.length) {
      quantizationChoices.append(el("p", { className: "llm-help", textContent: "Choose a compatible model to compare memory footprints." }));
    }
    for (const variant of variants) {
      const radio = el("input", {
        type: "radio", name: quantizationGroup, value: variant.id,
        checked: variant.id === selectedModelId,
      });
      radio.addEventListener("change", () => {
        if (busy || !radio.checked || !variant.compatible) return;
        selectedModelId = variant.id;
        syncControls();
      });
      quantizationChoices.append(el("label", { className: "llm-quantization-option" }, [
        radio,
        el("span", { className: "llm-quantization-detail" }, [
          el("span", { className: "llm-quantization-format", textContent: formatQuantization(variant) }),
          el("strong", { className: "llm-quantization-memory", textContent: `~${(variant.vramMB / 1024).toFixed(2)} GB` }),
          el("span", { className: "llm-help", textContent: `Fits GPU budget${variant.id === suggested?.id ? " · suggested" : ""}` }),
        ]),
      ]));
    }
  }

  function syncControls() {
    if (destroyed) return;
    const pending = !!busy;
    budget.disabled = pending;
    findBtn.disabled = pending;
    quantizationLevel.disabled = pending || !checkedVariants.length;
    localModel.disabled = pending || !modelsFound;
    quantization.disabled = pending || !modelsFound;
    loadBtn.disabled = pending || !selectedModelId || client.loadedModel === selectedModelId;
    unloadBtn.disabled = pending || !client.isLocalLoaded;
    scope.disabled = pending;
    sendBtn.disabled = pending || !input.value.trim() || !client.isLocalLoaded || client.loadedModel !== selectedModelId;
    stopBtn.disabled = !pending || controller?.signal.aborted;
    clearBtn.disabled = pending || !session.chat.length;
    undoBtn.disabled = pending || typeof ctx.undo !== "function";
    root.setAttribute("aria-busy", String(pending));
    if (busy !== "loading") modelStatus.textContent = client.isLocalLoaded
      ? `Loaded locally: ${client.loadedModel}.${client.loadedModel !== selectedModelId ? " Load the selected format to chat with it." : ""} Model weights may stay in the browser cache after unloading.`
      : "No model loaded. Downloads only start when you choose Load / download model.";
  }

  async function runJob(kind, work) {
    if (busy || destroyed) return;
    busy = kind;
    const job = new AbortController();
    controller = job;
    syncControls();
    try {
      await work(job.signal);
    } catch (error) {
      if (!destroyed) {
        if (job.signal.aborted || error?.name === "AbortError") {
          setStatus(kind === "generating" ? "Stopped. No response was applied. Reload the local model if it was released." : "Stopped. You can try again when ready.");
        } else {
          const detail = errorText(error);
          setStatus(detail, true);
          if (kind === "generating") addChat({ role: "error", content: detail });
        }
      }
    } finally {
      if (controller === job) {
        busy = "";
        controller = null;
        progress.hidden = true;
        syncControls();
      }
    }
  }

  function findModels() { return runJob("finding", async signal => {
    setStatus("Checking WebGPU and available local models…");
    const previousModel = localModel.value;
    const previousVariant = selectedModelId;
    const previousLevel = quantizationLevel.value;
    modelsFound = false;
    selectedModelId = "";
    checkedVariants = [];
    quantizationChoices.replaceChildren(el("p", { className: "llm-help", textContent: "Checking available formats…" }));
    localModel.replaceChildren(option("", "Checking GPU…"));
    const result = await client.getLocalModels({ budgetMB: budget.value === "auto" ? null : Number(budget.value) * 1024 });
    signal.throwIfAborted();
    if (destroyed) return;
    checkedVariants = result.gpu?.supported ? result.models : [];
    const levels = [...new Set(checkedVariants.map(model => model.weightBits))].sort((a, b) => a - b);
    quantizationLevel.replaceChildren(option("all", "All levels that fit"), ...levels.map(bits =>
      option(String(bits), `${bits}-bit · ${bits < 16 ? "compressed weights" : "unquantized weights"}`)));
    levelSummary.textContent = levels.length ? `Available weight levels: ${levels.map(bits => `${bits}-bit`).join(", ")}.`
      : "No weight precision level fits this GPU budget.";
    quantizationLevel.value = levels.some(bits => String(bits) === previousLevel) ? previousLevel : "all";
    renderModelChoices(previousModel, previousVariant);
    const allowance = Number.isFinite(result.availableMB)
      ? ` Model allowance: ${(result.availableMB / 1024).toFixed(1)} GB; ${(result.reservedMB / 1024).toFixed(1)} GB reserved for rendering.` : "";
    gpuNote.textContent = [result.gpu?.label, result.gpu?.note].filter(Boolean).join(". ") + allowance;
    gpuSummary.textContent = result.gpu?.supported
      ? `GPU details · ${(result.availableMB / 1024).toFixed(2)} GB for models`
      : "GPU unavailable · view details";
    setStatus(modelsFound ? "Choose a quantization level and model, then load the selected format. Higher bit counts preserve more weight precision and use more memory. Only GPU-compatible choices are listed." : "No compatible local model found. Use a browser with WebGPU enabled on HTTPS or localhost, check your GPU drivers, and choose a memory budget your GPU supports.");
  }); }

  findBtn.addEventListener("click", findModels);

  budget.addEventListener("change", findModels);
  quantizationLevel.addEventListener("change", () => { renderModelChoices(); syncControls(); });
  localModel.addEventListener("change", () => { renderQuantization(); syncControls(); });
  loadBtn.addEventListener("click", () => runJob("loading", async signal => {
    progress.hidden = false;
    progress.removeAttribute("value");
    setStatus("Loading local model. The first download can be large; initialization may take a few minutes.");
    modelStatus.textContent = "Downloading / initializing…";
    await client.loadLocal(selectedModelId, {
      onProgress: report => {
        if (destroyed || signal.aborted) return;
        const fraction = typeof report === "number" ? report : report?.progress;
        if (Number.isFinite(fraction)) progress.value = Math.min(1, Math.max(0, fraction));
        const text = typeof report === "string" ? report : report?.text;
        modelStatus.textContent = text || (Number.isFinite(fraction) ? `Loading model: ${Math.round(fraction * 100)}%` : "Initializing local model…");
      },
    });
    signal.throwIfAborted();
    setStatus("Local model ready. Your prompts and visual settings stay in this browser.");
  }));

  unloadBtn.addEventListener("click", () => runJob("unloading", async signal => {
    await client.unloadLocal();
    signal.throwIfAborted();
    setStatus("Local model unloaded; GPU memory released. Cached downloads can be reused.");
  }));

  input.addEventListener("input", syncControls);

  async function send() {
    if (sendBtn.disabled || busy || destroyed) return;
    const prompt = input.value.trim();
    await runJob("generating", async signal => {
      const request = buildAssistantRequest(ctx, {
        prompt, scope: scope.value, history: session.history,
        maxContextChars: 9000,
      });
      input.value = "";
      addChat({ role: "user", content: prompt });
      contextInfo.textContent = `Scope: ${request.scope}. Estimated input: ~${request.estimatedTokens.toLocaleString()} tokens; reply limit: 768 tokens. Current controls and a short recent history are included.`;
      setStatus("Streaming response… Changes apply after the complete reply is checked.");
      const streamedText = el("div", { className: "llm-message-text llm-stream-text" });
      const streamStatus = el("p", { className: "llm-help llm-stream-status", textContent: "Generating… No changes applied yet." });
      const liveReply = el("div", { className: "llm-message llm-message-assistant llm-stream", "aria-busy": "true" }, [
        el("strong", { textContent: "Assistant" }), streamedText, streamStatus,
      ]);
      chat.append(liveReply);
      chat.scrollTop = chat.scrollHeight;
      let streamed = "";
      let result;
      try {
        result = await client.complete({
          model: client.loadedModel,
          messages: request.messages, schema: request.schema, maxTokens: 768, signal,
          onToken: delta => {
            if (destroyed || signal.aborted) return;
            const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 48;
            streamed += delta;
            streamedText.textContent = streamedAssistantMessage(streamed);
            streamStatus.textContent = streamedText.textContent
              ? "Receiving reply and preparing changes… No changes applied yet."
              : "Preparing changes… No changes applied yet.";
            if (nearBottom) chat.scrollTop = chat.scrollHeight;
          },
        });
      } finally {
        liveReply.remove();
      }
      signal.throwIfAborted();
      if (destroyed) return;
      let parsed;
      try { parsed = JSON.parse(result.content); }
      catch { throw new Error("The model did not return valid structured JSON. No changes were applied. Try a smaller request or a stronger model."); }
      const receipt = applyAssistantActions(ctx, parsed, request.scope);
      const message = String(receipt.message || (receipt.summary?.length ? "Applied the following changes." : "No changes requested."));
      const summary = Array.isArray(receipt.summary) ? receipt.summary.map(String) : [];
      addChat({ role: "assistant", content: message, summary });
      session.history = trimHistory([...session.history,
        { role: "user", content: prompt },
        { role: "assistant", content: [message, ...summary].join("\n").slice(0, 3000) },
      ]);
      const usage = result.usage;
      const tokens = usage && Number.isFinite(usage.inputTokens) && Number.isFinite(usage.outputTokens)
        ? ` ${usage.inputTokens.toLocaleString()} input / ${usage.outputTokens.toLocaleString()} output tokens.` : "";
      setStatus(`${summary.length ? "Changes applied." : "Response received."}${tokens}`);
    });
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  });
  stopBtn.addEventListener("click", () => {
    if (!controller || controller.signal.aborted) return;
    controller.abort();
    client.cancel();
    setStatus("Stopping…");
    syncControls();
  });
  clearBtn.addEventListener("click", () => {
    session.chat = [];
    session.history = [];
    renderChat();
    setStatus("Conversation cleared from memory.");
    syncControls();
  });
  undoBtn.addEventListener("click", () => {
    try {
      const undone = ctx.undo?.();
      if (undone) ctx.refreshPanels?.();
      setStatus(undone ? "Undid the last visual change. The next request will use the current controls." : "No visual change available to undo.");
    } catch (error) { setStatus(errorText(error), true); }
  });

  root._onShow = syncControls;
  root._destroy = () => {
    if (destroyed) return;
    destroyed = true;
    controller?.abort();
    client.cancel();
    Promise.resolve(client.unloadLocal()).catch(() => {});
  };
  renderChat();
  syncControls();
  findModels();
  return root;
}

export function registerLLMTab() {
  registerTab("assistant", ctx => buildLLMTab(ctx));
}

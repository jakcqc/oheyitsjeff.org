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
import { buildAssistantRequest, applyAssistantActions } from "./llmTools.js";

// Conversation stays in memory, separate from exported/saved visual state.
const sessions = new WeakMap();
const HISTORY_LIMIT = 12;
const CHAT_LIMIT = 24;
const HISTORY_CHAR_LIMIT = 12000;

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

  const root = el("section", { className: "llm-tab", "aria-label": "Visual assistant" });
  const budget = el("select", {}, [option("auto", "Auto · check GPU memory"), ...[2, 4, 6, 8, 12, 16, 24, 32].map(gb => option(String(gb), `${gb} GB`))]);
  budget.value = "auto";
  const findBtn = button("Check GPU / Find models");
  const gpuNote = el("p", {
    className: "llm-help",
    textContent: "Checking GPU capabilities and memory information…",
  });
  const localModel = el("select", { disabled: true }, [option("", "Checking GPU…")]);
  const loadBtn = button("Load / download model");
  const unloadBtn = button("Unload model");
  const progress = el("progress", { max: 1, value: 0, hidden: true, "aria-label": "Model download and initialization" });
  const modelStatus = el("p", { className: "llm-help", textContent: "No model loaded. Downloads only start when you choose Load / download model." });
  const localSettings = el("div", { className: "llm-settings" }, [
    field("GPU memory budget", budget), findBtn, gpuNote,
    field("Local model · estimated GPU memory", localModel),
    el("div", { className: "llm-actions" }, [loadBtn, unloadBtn]), progress, modelStatus,
  ]);

  const scope = el("select", {}, [
    option("auto", "Auto · relevant controls only"), option("params", "Parameters"),
    option("animation", "Animation"), option("effects", "Effects"), option("flows", "Flows"),
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
  for (const text of ["What can I change?", "Animate one parameter slowly", "Apply a grayscale color effect", "Create a rotate-and-color flow"]) {
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

  function syncControls() {
    if (destroyed) return;
    const pending = !!busy;
    budget.disabled = pending;
    findBtn.disabled = pending;
    localModel.disabled = pending || !modelsFound;
    loadBtn.disabled = pending || !localModel.value || client.loadedModel === localModel.value;
    unloadBtn.disabled = pending || !client.isLocalLoaded;
    scope.disabled = pending;
    sendBtn.disabled = pending || !input.value.trim() || !client.isLocalLoaded;
    stopBtn.disabled = !pending || controller?.signal.aborted;
    clearBtn.disabled = pending || !session.chat.length;
    undoBtn.disabled = pending || typeof ctx.undo !== "function";
    root.setAttribute("aria-busy", String(pending));
    if (busy !== "loading") modelStatus.textContent = client.isLocalLoaded
      ? `Loaded locally: ${client.loadedModel}. Model weights may stay in the browser cache after unloading.`
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
    modelsFound = false;
    localModel.replaceChildren(option("", "Checking GPU…"));
    const result = await client.getLocalModels({ budgetMB: budget.value === "auto" ? null : Number(budget.value) * 1024 });
    signal.throwIfAborted();
    if (destroyed) return;
    localModel.replaceChildren();
    modelsFound = !!result.gpu?.supported && result.models.length > 0;
    localModel.append(option("", modelsFound ? "Choose a model" : "No compatible models for this budget"));
    const recommended = result.models.find(model => model.id.startsWith("Qwen2.5-3B-Instruct"))
      || result.models.find(model => model.id.startsWith("Qwen2.5-1.5B-Instruct")) || result.models[0];
    for (const model of result.models) localModel.append(option(model.id, `${model.label} · ~${(model.vramMB / 1024).toFixed(1)} GB${model === recommended ? " · suggested start" : ""}`));
    const allowance = Number.isFinite(result.availableMB)
      ? ` Model allowance: ${(result.availableMB / 1024).toFixed(1)} GB; ${(result.reservedMB / 1024).toFixed(1)} GB reserved for rendering.` : "";
    gpuNote.textContent = [result.gpu?.label, result.gpu?.note].filter(Boolean).join(". ") + allowance;
    if (modelsFound) localModel.value = result.models.some(model => model.id === previousModel) ? previousModel : recommended.id;
    setStatus(modelsFound ? "Choose a model, then load it. Start with 3B when it fits; larger models can follow complex requests better. The smallest models may miss requested changes." : "No compatible local model found. Use a browser with WebGPU enabled on HTTPS or localhost, check your GPU drivers, and choose a memory budget your GPU supports.");
  }); }

  findBtn.addEventListener("click", findModels);

  budget.addEventListener("change", findModels);
  localModel.addEventListener("change", syncControls);
  loadBtn.addEventListener("click", () => runJob("loading", async signal => {
    progress.hidden = false;
    progress.removeAttribute("value");
    setStatus("Loading local model. The first download can be large; initialization may take a few minutes.");
    modelStatus.textContent = "Downloading / initializing…";
    await client.loadLocal(localModel.value, {
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
      setStatus("Generating a structured response…");
      const result = await client.complete({
        model: client.loadedModel,
        messages: request.messages, schema: request.schema, maxTokens: 768, signal,
      });
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

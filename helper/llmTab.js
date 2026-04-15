// tabs/llmTab.js
import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm";
import { el, registerTab, VISUALS, exportVisualUIJsonSpec } from "../helper/visualHelp.js";

const CHAT_CACHE_KEY = "llmChatHistory";
const CONTEXT_CACHE_KEY = "llmInjectedContext";

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function fetchText(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return await res.text();
}

export function buildLLMTab() {
  const root = el("div", { className: "llm-tab" });

  const status = el("div", { className: "llm-status", textContent: "Idle" });
  const modelInfo = el("div", { className: "llm-model", textContent: "Model: —" });

  const chat = el("div", {
    className: "llm-chat",
    style: "max-height:300px;max-width:100%;overflow:auto;border:1px solid #444;padding:6px;"
  });

  const input = el("textarea", {
    style: "width:98%;max-width:100%;",
    placeholder: "Ask something…",
    rows: 4
  });

  const modelSelect = el("select", { style: "max-width:90%;margin-bottom:5px;" });
  const enableBtn = el("button", { textContent: "Enable Local LLM" });
  const sendBtn = el("button", { textContent: "Send" });
  const clearBtn = el("button", { textContent: "Clear Chat" });

  sendBtn.disabled = true;

  /* -------------------- injected context UI -------------------- */

  const contextHeader = el("div", { style: "margin-top:10px;margin-bottom:6px;font-weight:bold;" , textContent: "Injected context" });
  const contextRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px;" });

  const contextSource = el("select");
  contextSource.appendChild(el("option", { value: "none", textContent: "— Select context source —" }));
  contextSource.appendChild(el("option", { value: "propOpsRules", textContent: "PROP_OPS_RULES.md" }));
  contextSource.appendChild(el("option", { value: "animPresetsDoc", textContent: "ANIMATION_PRESETS.md" }));
  contextSource.appendChild(el("option", { value: "animateKakaya", textContent: "animateKakaya.json (preset)" }));
  contextSource.appendChild(el("option", { value: "visualUiJson", textContent: "Visual UI JSON (by visualId)" }));
  contextSource.appendChild(el("option", { value: "customPath", textContent: "Custom path (fetch)" }));

  const visualIdSelect = el("select", { style: "display:none;max-width:260px;" });
  const refreshVisualsBtn = el("button", { textContent: "Refresh Visuals", type: "button", style: "display:none;" });
  const customPathInput = el("input", { type: "text", placeholder: "e.g. ./helper/SOME_DOC.md", style: "display:none;min-width:260px;" });

  function populateVisualIds() {
    const ids = Object.keys(VISUALS || {}).sort();
    visualIdSelect.innerHTML = "";
    visualIdSelect.appendChild(el("option", { value: "", textContent: "— Select visualId —" }));
    for (const id of ids) {
      visualIdSelect.appendChild(el("option", { value: id, textContent: id }));
    }
  }
  populateVisualIds();

  const loadContextBtn = el("button", { textContent: "Load Context", type: "button" });
  const clearContextBtn = el("button", { textContent: "Clear Context", type: "button" });

  const contextList = el("div", { style: "border:1px solid #444;padding:6px;margin-bottom:10px;max-height:160px;overflow:auto;" });

  /** @type {{ id: string, name: string, content: string }[]} */
  let injectedContexts = [];

  function saveContexts() {
    localStorage.setItem(CONTEXT_CACHE_KEY, JSON.stringify(injectedContexts));
  }

  function loadContexts() {
    const raw = localStorage.getItem(CONTEXT_CACHE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) injectedContexts = parsed.filter(x => x && typeof x === "object");
    } catch {
      injectedContexts = [];
    }
  }

  function renderContexts() {
    contextList.innerHTML = "";
    if (!injectedContexts.length) {
      contextList.appendChild(el("div", { textContent: "(none loaded)" }));
      return;
    }

    for (const ctx of injectedContexts) {
      const row = el("div", { style: "display:flex;gap:8px;align-items:center;margin-bottom:6px;" });
      const name = el("div", { style: "flex:1;min-width:180px;word-break:break-word;", textContent: ctx.name });
      const copyBtn = el("button", {
        type: "button",
        textContent: "Copy",
        onclick: async () => {
          try { await navigator.clipboard.writeText(ctx.content); } catch {}
        }
      });
      const delBtn = el("button", {
        type: "button",
        textContent: "Remove",
        onclick: () => {
          injectedContexts = injectedContexts.filter(x => x.id !== ctx.id);
          saveContexts();
          renderContexts();
        }
      });
      row.append(name, copyBtn, delBtn);
      contextList.appendChild(row);
    }
  }

  loadContexts();
  renderContexts();

  contextSource.onchange = () => {
    const v = contextSource.value;
    const isVisual = v === "visualUiJson";
    const isCustom = v === "customPath";
    visualIdSelect.style.display = isVisual ? "" : "none";
    refreshVisualsBtn.style.display = isVisual ? "" : "none";
    customPathInput.style.display = isCustom ? "" : "none";
  };
  refreshVisualsBtn.onclick = () => populateVisualIds();

  loadContextBtn.onclick = async () => {
    try {
      const v = contextSource.value;
      if (v === "none") return;

      status.textContent = "Loading context…";

      if (v === "propOpsRules") {
        const md = await fetchText("../helper/PROP_OPS_RULES.md");
        injectedContexts.push({
          id: makeId(),
          name: "PROP_OPS_RULES.md",
          content: `SOURCE: ../helper/PROP_OPS_RULES.md\n\n${md}`,
        });
      } else if (v === "animPresetsDoc") {
        const md = await fetchText("../helper/ANIMATION_PRESETS.md");
        injectedContexts.push({
          id: makeId(),
          name: "ANIMATION_PRESETS.md",
          content: `SOURCE: helper/ANIMATION_PRESETS.md\n\n${md}`,
        });
      } else if (v === "animateKakaya") {
        const jsonText = await fetchText("../helper/animateKakaya.json");
        injectedContexts.push({
          id: makeId(),
          name: "animateKakaya.json",
          content: `SOURCE: helper/animateKakaya.json\n\n${jsonText}`,
        });
      } else if (v === "visualUiJson") {
        const visualId = visualIdSelect.value;
        if (!visualId) return alert("Select a visualId");
        const ui = exportVisualUIJsonSpec(visualId);
        injectedContexts.push({
          id: makeId(),
          name: `VISUALS[${visualId}] UI metadata`,
          content:
            `SOURCE: helper/visualHelp.js\n` +
            `export const VISUALS = /** @type {Record<string, VisualSpec>} */ ({});\n\n` +
            `VISUAL_UI_JSON:\n${JSON.stringify(ui, null, 2)}`,
        });
      } else if (v === "customPath") {
        const path = String(customPathInput.value || "").trim();
        if (!path) return alert("Enter a path to fetch (e.g. ./helper/PROP_OPS_RULES.md)");
        const text = await fetchText(path);
        injectedContexts.push({
          id: makeId(),
          name: path,
          content: `SOURCE: ${path}\n\n${text}`,
        });
      }

      saveContexts();
      renderContexts();
      status.textContent = "Context loaded";
    } catch (err) {
      console.error(err);
      status.textContent = "Context load failed";
      alert(String(err?.message || err));
    }
  };

  clearContextBtn.onclick = () => {
    if (!confirm("Clear injected context?")) return;
    injectedContexts = [];
    localStorage.removeItem(CONTEXT_CACHE_KEY);
    renderContexts();
  };

  contextRow.append(contextSource, visualIdSelect, refreshVisualsBtn, customPathInput, loadContextBtn, clearContextBtn);

  root.append(
    modelSelect,
    enableBtn,
    clearBtn,
    modelInfo,
    contextHeader,
    contextRow,
    contextList,
    chat,
    input,
    sendBtn,
    status
  );

  /* -------------------- model population -------------------- */

  const models = webllm.prebuiltAppConfig.model_list;
  const memGB = (navigator.deviceMemory || 0) * 1000;

  function populateModels() {
    modelSelect.innerHTML = "";
    modelSelect.appendChild(
      el("option", { value: "", textContent: "— Select Model —" })
    );

    models
      .filter(m => m.overrides?.context_window_size && memGB >= m.vram_required_MB)
      .sort((a, b) => a.vram_required_MB - b.vram_required_MB)
      .forEach(m => {
        modelSelect.appendChild(
          el("option", {
            value: m.model_id,
            textContent: `${m.model_id} — ${m.vram_required_MB}MB • ctx ${m.overrides.context_window_size}`
          })
        );
      });
  }

  populateModels();

  const lastModel = localStorage.getItem("lastLLMModel");
  if (lastModel) {
    modelSelect.value = lastModel;
    setTimeout(() => enableBtn.click(), 0);
  }

  /* -------------------- engine + state -------------------- */

  let engine = null;
  let modelReady = false;
  let messages = [];
  let nextMsgId = 0;

  /* -------------------- chat persistence -------------------- */

  function saveChat() {
    localStorage.setItem(
      CHAT_CACHE_KEY,
      JSON.stringify({ messages, nextMsgId })
    );
  }

  function loadChat() {
    const raw = localStorage.getItem(CHAT_CACHE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      messages = parsed.messages || [];
      nextMsgId = parsed.nextMsgId || 0;
    } catch {
      messages = [];
      nextMsgId = 0;
    }
  }

  loadChat();

  /* -------------------- render -------------------- */

  function renderChat() {
    chat.innerHTML = "";

    messages.forEach(msg => {
      const bubble = el("div", {
        style: `
          margin-bottom:6px;
          padding:6px;
          border-radius:4px;
          background:${msg.role === "user" ? "#222" : "#333"};
        `
      });

      const label = el("strong", {
        style: "text-decoration:underline;",
        textContent: msg.role === "user" ? "You" : "LLM"
      });

      const text = el("div", {
        style: "margin-top:5px;",
        textContent: msg.content
      });

      const del = el("button", {
        textContent: "✕",
        type: "button",
        style: "float:right;",
        onclick: () => {
          messages = messages.filter(m => m.id !== msg.id);
          saveChat();
          renderChat();
        }
      });

      bubble.append(del, label, text);
      chat.appendChild(bubble);
    });

    chat.scrollTop = chat.scrollHeight;
  }

  renderChat();

  /* -------------------- load model -------------------- */

  enableBtn.onclick = async () => {
    const modelId = modelSelect.value;
    if (!modelId) return alert("Select a model first");
    if (!navigator.gpu) return alert("WebGPU not supported");

    enableBtn.disabled = true;
    status.textContent = "Downloading model…";

    engine = new webllm.MLCEngine();

    await engine.reload(modelId, {
      initProgressCallback(p) {
        status.textContent = `Loading model: ${Math.round(p * 100)}%`;
      }
    });

    localStorage.setItem("lastLLMModel", modelId);

    modelReady = true;
    sendBtn.disabled = false;
    modelInfo.textContent = `Model: ${modelId}`;
    status.textContent = "Model ready (local)";
    enableBtn.disabled = false;
  };

  /* -------------------- chat -------------------- */

  sendBtn.onclick = async () => {
    if (!modelReady) return;

    const prompt = input.value.trim();
    if (!prompt) return;

    input.value = "";
    sendBtn.disabled = true;

    messages.push({ id: nextMsgId++, role: "user", content: prompt });
    saveChat();
    renderChat();

    const injected =
      injectedContexts.length === 0
        ? ""
        : `\n\nYou have access to the following loaded context sources.\n` +
          `Use them when relevant.\n\n` +
          injectedContexts
            .map((c) => `---\n${c.name}\n---\n${c.content}\n`)
            .join("\n");

    const systemMessage = { role: "system", content: "You are a helpful assistant." + injected };

    // Add an "in-progress" assistant bubble immediately so the UI updates.
    const assistantMsg = { id: nextMsgId++, role: "assistant", content: "" };
    messages.push(assistantMsg);
    saveChat();
    renderChat();

    let assistantTextEl = null;
    // Last bubble should be the assistant message we just pushed.
    const lastBubble = chat.lastElementChild;
    if (lastBubble) {
      // bubble structure: [del, label, text]
      assistantTextEl = lastBubble.querySelector("div");
    }

    // Try streaming first (if supported by WebLLM build).
    try {
      const stream = await engine.chat.completions.create({
        messages: [systemMessage, ...messages.filter(m => m !== assistantMsg)], // don't echo the placeholder back
        temperature: 0.5,
        max_tokens: 10480,
        stream: true,
      });

      if (stream && typeof stream[Symbol.asyncIterator] === "function") {
        status.textContent = "Generating…";
        let acc = "";
        for await (const chunk of stream) {
          const delta = chunk?.choices?.[0]?.delta?.content ?? "";
          if (!delta) continue;
          acc += delta;
          assistantMsg.content = acc;
          if (assistantTextEl) assistantTextEl.textContent = acc;
          chat.scrollTop = chat.scrollHeight;
        }
      } else {
        throw new Error("Streaming not supported by this WebLLM build.");
      }
    } catch (err) {
      // Fallback to non-streaming response.
      const res = await engine.chat.completions.create({
        messages: [systemMessage, ...messages.filter(m => m !== assistantMsg)],
        temperature: 0.5,
        max_tokens: 10480,
      });
      assistantMsg.content = res?.choices?.[0]?.message?.content ?? "";
      if (assistantTextEl) assistantTextEl.textContent = assistantMsg.content;
    }

    saveChat();
    renderChat();
    sendBtn.disabled = false;
  };

  /* -------------------- clear chat -------------------- */

  clearBtn.onclick = () => {
    if (!confirm("Clear all chat history?")) return;
    messages = [];
    nextMsgId = 0;
    localStorage.removeItem(CHAT_CACHE_KEY);
    renderChat();
  };

  return root;
}

export function registerLLMTab() {
  registerTab("LLM", () => buildLLMTab());
}

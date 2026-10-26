import { bridge, isPreview } from "./bridge.mjs";
import { initializeLibrary } from "./library-panel.mjs";
import { createPreferencesRuntime, LANGUAGE_OPTIONS, LANGUAGE_NAMES } from "./preferences.mjs";

const byId = (id) => document.getElementById(id);
const preferences = createPreferencesRuntime();
const t = (...args) => preferences.t(...args);
const elements = {
  connectionLabel: byId("connection-label"),
  platformLabel: byId("platform-label"),
  list: byId("conversation-list"),
  newChat: byId("new-chat"),
  modelLabel: byId("model-label"),
  chooseModel: byId("choose-model"),
  unloadModel: byId("unload-model"),
  alphaNotice: byId("alpha-notice"),
  previewNotice: byId("preview-notice"),
  conversationTitle: byId("conversation-title"),
  renameChat: byId("rename-chat"),
  deleteChat: byId("delete-chat"),
  thread: byId("thread"),
  welcome: byId("welcome"),
  composer: byId("composer"),
  prompt: byId("prompt-input"),
  send: byId("send-button"),
  cancel: byId("cancel-button"),
  composerHint: byId("composer-hint"),
  mode: byId("mode-select"),
  maxTokens: byId("max-tokens"),
  tokenValue: byId("token-value"),
  temperature: byId("temperature"),
  temperatureValue: byId("temperature-value"),
  limits: byId("limits-label"),
  errorBanner: byId("error-banner"),
  errorMessage: byId("error-message"),
  retry: byId("retry"),
  backdrop: byId("dialog-backdrop"),
  dialogTitle: byId("dialog-title"),
  dialogDescription: byId("dialog-description"),
  dialogForm: byId("dialog-form"),
  dialogInput: byId("dialog-input"),
  dialogCancel: byId("dialog-cancel"),
  dialogConfirm: byId("dialog-confirm"),
  toast: byId("toast"),
  appearance: byId("appearance-select"),
  language: byId("language-select"),
};

let appState = null;
let chats = [];
let activeChat = null;
let generation = null;
let queuedEvents = [];
let dialogAction = null;
let previousFocus = null;
let toastTimer = null;
const messageNodes = new Map();

function showError(message) {
  elements.errorMessage.removeAttribute("data-message-key");
  elements.errorMessage.textContent = String(message || t("error.generic"));
  elements.errorBanner.dataset.visible = "true";
}

function showLocalizedError(key, values = {}) {
  elements.errorMessage.dataset.messageKey = key;
  elements.errorMessage.dataset.messageValues = JSON.stringify(values);
  elements.errorMessage.textContent = t(key, values);
  elements.errorBanner.dataset.visible = "true";
}

function clearError() {
  elements.errorBanner.dataset.visible = "false";
  elements.errorMessage.textContent = "";
  elements.errorMessage.removeAttribute("data-message-key");
  elements.errorMessage.removeAttribute("data-message-values");
}

function showToast(key, values = {}) {
  elements.toast.dataset.messageKey = key;
  elements.toast.dataset.messageValues = JSON.stringify(values);
  elements.toast.textContent = t(key, values);
  elements.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(preferences.language, { month: "short", day: "numeric" }).format(date);
}

function localizedStatus(value) {
  const keys = { generating: "message.generating", complete: "message.complete", cancelled: "message.cancelled", error: "message.error" };
  return keys[value] ? t(keys[value]) : (value || t("message.complete"));
}

function localizedFinish(value) {
  const key = `message.finishReason.${value}`;
  return t(key) === key ? value : t(key);
}

function languageName(code) {
  const translated = t(`language.${code}`);
  return translated === LANGUAGE_NAMES[code] ? translated : `${LANGUAGE_NAMES[code]} · ${translated}`;
}

function syncNativePreferences() {
  bridge.setUIPreferences?.({ language: preferences.language, appearance: preferences.preferences.appearance }).catch(error => showError(error.message));
}

function isRunning() {
  return Boolean((appState && (appState.busy || appState.loading)) || generation);
}

function activeConversationIsGenerating() {
  return Boolean(generation && activeChat && generation.chatId === activeChat.id);
}

function renderState() {
  if (!appState) return;
  const previewMode = isPreview || appState.mode === "preview";
  elements.previewNotice.hidden = !previewMode;
  const metaState = previewMode ? "preview" : (appState.busy ? "busy" : "ready");
  elements.connectionLabel.parentElement.dataset.state = metaState;
  elements.connectionLabel.textContent = previewMode ? t("status.preview") : (appState.busy ? t("status.busy") : t("status.ready"));
  elements.platformLabel.textContent = previewMode ? t("status.browserOnly") : (appState.platform || t("status.desktop"));

  const model = appState.model;
  if (!model) {
    elements.modelLabel.textContent = previewMode ? t("model.previewUnavailable") : t("model.none");
  } else {
    const details = [model.architecture, model.parameters].filter(Boolean).join(" · ");
    elements.modelLabel.textContent = details ? `${model.id} · ${details}` : model.id;
  }
  const running = isRunning();
  elements.chooseModel.disabled = previewMode || running;
  elements.chooseModel.textContent = appState.loading ? t("model.loading") : t("model.choose");
  elements.unloadModel.disabled = previewMode || !model || running;

  const maxAllowed = Math.max(1, Math.min(128, Number(appState.limits && appState.limits.maxTokens) || 128));
  elements.maxTokens.max = String(maxAllowed);
  elements.maxTokens.value = String(Math.min(Number(elements.maxTokens.value), maxAllowed));
  elements.tokenValue.textContent = elements.maxTokens.value;
   const context = Number(appState.model && appState.model.context) || Number(appState.limits && appState.limits.context) || 512;
  elements.limits.replaceChildren();
  const limitLabel = document.createElement("span");
  limitLabel.textContent = t("controls.context");
  const limitValue = document.createElement("br");
  const limitNumber = document.createTextNode(t("controls.tokens", { count: context }));
  elements.limits.append(limitLabel, limitValue, limitNumber);

  const chatOption = elements.mode.querySelector('option[value="chat"]');
  chatOption.disabled = !previewMode && (!model || !model.chatTemplate);
  if (!previewMode && !model && elements.mode.value === "chat") {
    elements.composerHint.textContent = t("hint.chatRequiresModel");
  }
  renderControls();
}

function renderControls() {
  const previewMode = isPreview || (appState && appState.mode === "preview");
  const running = isRunning();
  const hasChat = Boolean(activeChat);
  const modelReady = Boolean(appState && appState.model);
  const canRun = !previewMode && hasChat && modelReady && !running &&
    (elements.mode.value !== "chat" || Boolean(appState.model.chatTemplate));
  elements.prompt.disabled = !canRun;
  elements.send.disabled = !canRun || !elements.prompt.value.trim();
  elements.cancel.hidden = !generation;
  elements.cancel.disabled = !generation;
  elements.renameChat.disabled = !hasChat;
  elements.deleteChat.disabled = !hasChat || activeConversationIsGenerating();
  elements.mode.disabled = running;
  elements.maxTokens.disabled = running;
  elements.temperature.disabled = running;
  elements.newChat.disabled = false;

  if (previewMode) {
    elements.composerHint.textContent = t("hint.preview");
  } else if (!hasChat) {
    elements.composerHint.textContent = t("hint.create");
  } else if (!modelReady) {
    elements.composerHint.textContent = t("hint.chooseModel");
  } else if (elements.mode.value === "chat" && !appState.model.chatTemplate) {
    elements.composerHint.textContent = t("hint.noTemplate");
  } else if (generation) {
    elements.composerHint.textContent = t("hint.streaming");
  } else if (appState.busy) {
    elements.composerHint.textContent = t("hint.engineBusy");
  } else {
    elements.composerHint.textContent = elements.mode.value === "completion"
      ? t("hint.completion")
      : t("hint.instruction");
  }
}

function renderList() {
  const list = elements.list;
  list.replaceChildren();
  if (!chats.length) {
    const empty = document.createElement("p");
    empty.className = "empty-sidebar";
    empty.textContent = t("sidebar.empty");
    list.append(empty);
    return;
  }
  for (const summary of chats) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "conversation-item";
    item.setAttribute("aria-current", activeChat && activeChat.id === summary.id ? "page" : "false");
    item.setAttribute("aria-label", t("sidebar.messages", { title: summary.title, count: summary.messageCount || 0, date: formatDate(summary.updatedAt) }));
    const title = document.createElement("span");
    title.className = "conversation-title";
    title.textContent = summary.title;
    const count = document.createElement("span");
    count.className = "conversation-count";
    count.textContent = String(summary.messageCount || 0);
    item.append(title, count);
    item.addEventListener("click", () => selectChat(summary.id));
    list.append(item);
  }
}

function makeMessageNode(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role === "user" ? "user" : "assistant"}`;
  if (message.status === "error") article.classList.add("error");
  const head = document.createElement("div");
  head.className = "message-head";
  const mark = document.createElement("span");
  mark.className = "role-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = message.role === "user" ? t("message.you") : "K";
  const role = document.createElement("span");
  role.className = "message-role";
  role.textContent = message.role === "user"
    ? t("message.prompt")
    : (message.mode === "completion" ? t("message.completion") : t("message.localOutput"));
  const status = document.createElement("span");
  status.className = "message-status";
  status.textContent = localizedStatus(message.status);
  head.append(mark, role, status);
  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = message.content || (message.status === "generating" ? t("message.waiting") : "");
  article.append(head, content);

  let meta = null;
  const usage = message.usage;
  if (usage || message.finishReason) {
    meta = document.createElement("div");
    meta.className = "message-meta";
    const facts = [];
    if (usage && Number.isFinite(usage.prompt_tokens) && Number.isFinite(usage.completion_tokens)) {
      facts.push(t("message.usage", { prompt: usage.prompt_tokens, completion: usage.completion_tokens }));
    }
    if (message.finishReason) facts.push(t("message.finish", { reason: localizedFinish(message.finishReason) }));
    meta.textContent = facts.join(" · ");
    article.append(meta);
  }
  return { article, content, status, meta };
}

function renderThread() {
  messageNodes.clear();
  elements.thread.replaceChildren();
  if (!activeChat || !activeChat.messages || activeChat.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "welcome";
    const glyph = document.createElement("div");
    glyph.className = "welcome-glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "K / 01";
    const title = document.createElement("h2");
    title.textContent = activeChat ? t("welcome.ready") : t("welcome.title");
    const description = document.createElement("p");
    description.textContent = activeChat
      ? t("welcome.readyBody")
      : t("welcome.body");
    empty.append(glyph, title, description);
    elements.thread.append(empty);
    return;
  }
  for (const message of activeChat.messages) {
    const node = makeMessageNode(message);
    messageNodes.set(message.id, node);
    elements.thread.append(node.article);
  }
  elements.thread.scrollTop = elements.thread.scrollHeight;
}

function updateMessageNode(message) {
  const node = messageNodes.get(message.id);
  if (!node) {
    if (activeChat && activeChat.id === (generation && generation.chatId)) renderThread();
    return;
  }
  node.article.classList.toggle("error", message.status === "error");
  node.status.textContent = localizedStatus(message.status);
  node.content.textContent = message.content || (message.status === "generating" ? t("message.waiting") : "");
  if (message.usage || message.finishReason) {
    if (!node.meta) {
      node.meta = document.createElement("div");
      node.meta.className = "message-meta";
      node.article.append(node.meta);
    }
    const facts = [];
    if (message.usage && Number.isFinite(message.usage.prompt_tokens) && Number.isFinite(message.usage.completion_tokens)) {
      facts.push(t("message.usage", { prompt: message.usage.prompt_tokens, completion: message.usage.completion_tokens }));
    }
    if (message.finishReason) facts.push(t("message.finish", { reason: localizedFinish(message.finishReason) }));
    node.meta.textContent = facts.join(" · ");
  }
}

function renderActiveChat() {
  elements.conversationTitle.textContent = activeChat ? activeChat.title : t("chat.none");
  renderThread();
  renderControls();
  renderList();
}

async function refreshChats() {
  chats = await bridge.listChats();
  renderList();
}

async function loadChat(id) {
  const chat = await bridge.getChat(id);
  if (!activeChat || activeChat.id !== id) return;
  activeChat = chat;
  renderActiveChat();
}

async function selectChat(id) {
  clearError();
  try {
    activeChat = await bridge.getChat(id);
    renderActiveChat();
  } catch (error) {
    showError(error.message);
  }
}

async function createConversation() {
  clearError();
  try {
    const chat = await bridge.createChat(t("chat.new"));
    activeChat = chat;
    await refreshChats();
    renderActiveChat();
    elements.prompt.focus();
  } catch (error) {
    showError(error.message);
  }
}

function openDialog(action) {
  if (!activeChat) return;
  previousFocus = document.activeElement;
  dialogAction = action;
  const deleting = action === "delete";
  elements.dialogTitle.textContent = deleting ? t("dialog.deleteTitle") : t("dialog.renameTitle");
  elements.dialogDescription.textContent = deleting
    ? t("dialog.deleteDescription", { title: activeChat.title })
    : t("dialog.renameDescription");
  elements.dialogInput.value = deleting ? "" : activeChat.title;
  elements.dialogInput.hidden = deleting;
  elements.dialogInput.required = !deleting;
  elements.dialogConfirm.textContent = deleting ? t("dialog.delete") : t("dialog.save");
  elements.dialogConfirm.className = deleting ? "danger-button" : "primary-button";
  elements.backdrop.hidden = false;
  if (!deleting) {
    elements.dialogInput.focus();
    elements.dialogInput.select();
  } else {
    elements.dialogCancel.focus();
  }
}

function closeDialog() {
  elements.backdrop.hidden = true;
  dialogAction = null;
  if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
}

async function submitDialog(event) {
  event.preventDefault();
  if (!activeChat || !dialogAction) return;
  const id = activeChat.id;
  const action = dialogAction;
  try {
    if (action === "rename") {
      const title = elements.dialogInput.value.trim();
      if (!title) {
        elements.dialogInput.focus();
        return;
      }
      activeChat = await bridge.renameChat(id, title);
      showToast("toast.renamed");
      await refreshChats();
      renderActiveChat();
    } else if (action === "delete") {
      if (generation && generation.chatId === id) {
        showLocalizedError("error.deleteGenerating");
        closeDialog();
        return;
      }
      await bridge.deleteChat(id);
      activeChat = null;
      await refreshChats();
      renderActiveChat();
      if (chats.length) await selectChat(chats[0].id);
      showToast("toast.deleted");
    }
    closeDialog();
  } catch (error) {
    showError(error.message);
  }
}

function addLocalMessage(message) {
  if (!activeChat) return;
  activeChat.messages = activeChat.messages || [];
  activeChat.messages.push(message);
  if (activeChat.id === (generation && generation.chatId)) renderThread();
}

function applyGenerationEvent(event) {
  if (!generation || event.jobId !== generation.jobId) return;
  if (event.chatId !== generation.chatId || event.messageId !== generation.messageId) return;
  const message = generation.assistant;
  if (event.type === "token") {
    message.content += event.text;
    message.status = "generating";
    if (activeChat && activeChat.id === generation.chatId) updateMessageNode(message);
  } else if (event.type === "done") {
    message.status = "complete";
    message.finishReason = event.finishReason;
    message.usage = event.usage;
    finishGeneration();
  } else if (event.type === "error") {
    message.status = event.cancelled ? "cancelled" : "error";
    if (event.message) message.content = event.message;
    if (!event.cancelled && event.message) showError(event.message);
    finishGeneration();
  }
}

function finishGeneration() {
  const finished = generation;
  if (finished && finished.assistant && activeChat && activeChat.id === finished.chatId) {
    updateMessageNode(finished.assistant);
  }
  generation = null;
  queuedEvents = [];
  if (appState) appState = { ...appState, busy: false };
  renderControls();
  if (finished) {
    refreshChats().catch((error) => showError(error.message));
    if (activeChat && activeChat.id === finished.chatId) {
      loadChat(finished.chatId).catch((error) => showError(error.message));
    }
  }
}

async function submitPrompt(event) {
  event.preventDefault();
  const prompt = elements.prompt.value;
  if (!prompt.trim() || !activeChat || !appState || !appState.model || isPreview) return;
  if (isRunning()) return;
  if (elements.mode.value === "chat" && !appState.model.chatTemplate) {
    showLocalizedError("error.chatTemplate");
    return;
  }
  clearError();
  const chatId = activeChat.id;
  const mode = elements.mode.value;
  const localUser = {
    id: `local-user-${Date.now()}`,
    role: "user",
    content: prompt,
    status: "complete",
    mode,
  };
  const assistant = {
    id: `local-assistant-${Date.now()}`,
    role: "assistant",
    content: "",
    status: "generating",
    mode,
    model: appState.model.id,
  };
  generation = { starting: true, jobId: null, messageId: null, chatId, assistant };
  queuedEvents = [];
  activeChat.messages.push(localUser, assistant);
  renderActiveChat();
  elements.prompt.value = "";
  renderControls();
  try {
    const result = await bridge.generate({
      chatId,
      prompt,
      maxTokens: Number(elements.maxTokens.value),
      temperature: Number(elements.temperature.value),
      mode,
    });
    if (!generation || generation.chatId !== chatId) return;
    generation.jobId = result.jobId;
    generation.messageId = result.messageId;
    generation.starting = false;
    assistant.id = result.messageId;
    messageNodes.clear();
    if (activeChat && activeChat.id === chatId) renderThread();
    const pendingEvents = queuedEvents;
    queuedEvents = [];
    for (const queued of pendingEvents) applyGenerationEvent(queued);
    renderControls();
  } catch (error) {
    if (generation && generation.chatId === chatId) {
      assistant.status = "error";
      assistant.content = error.message;
      showError(error.message);
      finishGeneration();
    }
  }
}

async function chooseModel() {
  clearError();
  try {
    appState = { ...appState, loading: true };
    renderState();
    appState = await bridge.chooseModel();
    renderState();
    if (appState.model) showToast("toast.loaded", { id: appState.model.id });
  } catch (error) {
    if (appState) appState = { ...appState, loading: false };
    renderState();
    showError(error.message);
  }
}

async function unloadModel() {
  clearError();
  try {
    appState = await bridge.unloadModel();
    renderState();
    showToast("toast.unloaded");
  } catch (error) {
    showError(error.message);
  }
}

async function cancelGeneration() {
  if (!generation) return;
  elements.cancel.disabled = true;
  try {
    await bridge.cancel();
    showToast("toast.cancelRequested");
  } catch (error) {
    elements.cancel.disabled = false;
    showError(error.message);
  }
}

async function initialize() {
  clearError();
  try {
    const [state, summaries] = await Promise.all([bridge.state(), bridge.listChats()]);
    appState = state;
    chats = summaries;
    renderState();
    if (chats.length) activeChat = await bridge.getChat(chats[0].id);
    renderActiveChat();
  } catch (error) {
    elements.list.replaceChildren();
    showError(error.message);
  } finally {
    elements.newChat.disabled = false;
  }
}

preferences.start();
syncNativePreferences();
elements.appearance.value = preferences.preferences.appearance;
elements.language.replaceChildren();
for (const language of LANGUAGE_OPTIONS) {
  const option = document.createElement("option");
  option.value = language;
  option.textContent = languageName(language);
  elements.language.append(option);
}
const automaticOption = document.createElement("option");
automaticOption.value = "automatic";
automaticOption.textContent = t("preferences.automatic");
elements.language.prepend(automaticOption);
elements.language.value = preferences.preferences.language;
elements.appearance.addEventListener("change", () => preferences.setAppearance(elements.appearance.value));
elements.language.addEventListener("change", () => preferences.setLanguage(elements.language.value));
window.addEventListener("keyo:localechange", () => {
  syncNativePreferences();
  if (elements.errorMessage.dataset.messageKey) {
    let values = {};
    try { values = JSON.parse(elements.errorMessage.dataset.messageValues || "{}"); } catch {}
    elements.errorMessage.textContent = t(elements.errorMessage.dataset.messageKey, values);
  }
  if (!elements.toast.hidden && elements.toast.dataset.messageKey) {
    let values = {};
    try { values = JSON.parse(elements.toast.dataset.messageValues || "{}"); } catch {}
    elements.toast.textContent = t(elements.toast.dataset.messageKey, values);
  }
  elements.language.querySelectorAll("option").forEach(option => {
    option.textContent = option.value === "automatic" ? t("preferences.automatic") : languageName(option.value);
  });
  if (appState) renderState();
  renderActiveChat();
  if (dialogAction && activeChat) {
    const pendingName = elements.dialogInput.value;
    const returnFocus = previousFocus;
    openDialog(dialogAction);
    if (dialogAction === "rename") elements.dialogInput.value = pendingName;
    previousFocus = returnFocus;
  }
});

elements.newChat.addEventListener("click", createConversation);
initializeLibrary({ t });
elements.chooseModel.addEventListener("click", chooseModel);
elements.unloadModel.addEventListener("click", unloadModel);
elements.renameChat.addEventListener("click", () => openDialog("rename"));
elements.deleteChat.addEventListener("click", () => openDialog("delete"));
elements.dialogCancel.addEventListener("click", closeDialog);
elements.dialogForm.addEventListener("submit", submitDialog);
elements.composer.addEventListener("submit", submitPrompt);
elements.cancel.addEventListener("click", cancelGeneration);
elements.retry.addEventListener("click", () => initialize());
elements.prompt.addEventListener("input", renderControls);
elements.mode.addEventListener("change", renderControls);
elements.maxTokens.addEventListener("input", () => { elements.tokenValue.textContent = elements.maxTokens.value; });
elements.temperature.addEventListener("input", () => { elements.temperatureValue.textContent = Number(elements.temperature.value).toFixed(1); });
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !elements.prompt.disabled) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
  if (event.key === "Escape" && !elements.backdrop.hidden) closeDialog();
});

bridge.onEvent((event) => {
  if (event.type === "state") {
    appState = event.state;
    renderState();
    return;
  }
  if (!generation) return;
  if (generation.starting) {
    queuedEvents.push(event);
    return;
  }
  applyGenerationEvent(event);
});

initialize();

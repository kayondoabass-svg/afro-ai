const previewLimits = Object.freeze({ maxTokens: 128, context: 512, maxWeightsMiB: 256 });
const storageKey = "keyo-studio.preview.chats.v1";

function readPreviewChats() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 200 || !parsed.every((chat) =>
      chat && typeof chat.id === "string" && typeof chat.title === "string" &&
      typeof chat.createdAt === "string" && typeof chat.updatedAt === "string" &&
      Array.isArray(chat.messages) && chat.messages.length <= 512 &&
      chat.messages.every(message => message && typeof message.content === "string" && typeof message.id === "string" &&
        ["user","assistant"].includes(message.role))
    )) throw new Error("Browser-local conversation data is invalid.");
    return parsed;
  } catch (error) {
    throw new Error(`Could not read browser-local conversations: ${error.message}`);
  }
}

function writePreviewChats(chats) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(chats));
  } catch (error) {
    throw new Error(`Could not save browser-local conversations: ${error.message}`);
  }
}

function previewChat(summary) {
  return {
    id: summary.id,
    title: summary.title,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messages: summary.messages.map((message) => ({ ...message })),
  };
}

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const preview = {
  async state() {
    return { mode: "preview", platform: "browser", model: null, loading: false, busy: false, limits: previewLimits };
  },
  async chooseModel() {
    throw new Error("Model selection is unavailable in the interface preview. Install the desktop app to use local models.");
  },
  async unloadModel() {
    throw new Error("Model controls are unavailable in the interface preview.");
  },
  async listChats() {
    return readPreviewChats()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(({ messages, ...summary }) => ({ ...summary, messageCount: messages.length }));
  },
  async createChat() {
    if (readPreviewChats().length >= 200) throw new Error("Conversation limit reached. Delete a conversation first.");
    const now = new Date().toISOString();
    const chat = { id: makeId(), title: "Untitled conversation", createdAt: now, updatedAt: now, messages: [] };
    writePreviewChats([chat, ...readPreviewChats()]);
    return previewChat(chat);
  },
  async getChat(id) {
    const chat = readPreviewChats().find((item) => item.id === id);
    if (!chat) throw new Error("Conversation could not be found in this browser.");
    return previewChat(chat);
  },
  async renameChat(id, title) {
    if (typeof title !== "string" || !title.trim() || title.length > 100) throw new Error("Use a title of 1–100 characters.");
    const chats = readPreviewChats();
    const chat = chats.find((item) => item.id === id);
    if (!chat) throw new Error("Conversation could not be found in this browser.");
    chat.title = title.trim();
    chat.updatedAt = new Date().toISOString();
    writePreviewChats(chats);
    return previewChat(chat);
  },
  async deleteChat(id) {
    const chats = readPreviewChats();
    if (!chats.some((chat) => chat.id === id)) throw new Error("Conversation could not be found in this browser.");
    writePreviewChats(chats.filter((chat) => chat.id !== id));
  },
  async generate() {
    throw new Error("Generation is unavailable in the interface preview. No model or response is simulated.");
  },
  async cancel() {
    throw new Error("There is no preview generation to cancel.");
  },
  onEvent() {
    return () => {};
  },
};

const nativeBridge = typeof window !== "undefined" && window.keyo;
export const bridge = nativeBridge || preview;
export const isPreview = !nativeBridge;

export interface ModelEntry {
  id: string;
  name: string;
  architecture: string;
  bytes: number;
  license: string;
  repository: string;
  revision: string;
  note: string;
  licenseUrl: string;
}
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status?: 'streaming' | 'complete' | 'interrupted' | 'error';
}
export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  messages: Message[];
  updatedAt: number;
}
export interface StudioState {
  models: ModelEntry[];
  installed: string[];
  conversations: Conversation[];
  activeChat: Conversation | null;
  selectedModel: string;
  engine: 'idle' | 'loading' | 'ready' | 'generating' | 'error';
  engineInfo: string;
  progress: { modelId: string; bytes: number; total: number; phase: string } | null;
  error: string;
  notice: string;
  online: boolean;
  storage: { usage: number; quota: number; persistent: boolean };
  supported: boolean;
  options: { maxTokens: number; temperature: number; mode: 'chat' | 'completion' };
  theme: 'system' | 'light' | 'dark';
  createChat(): void;
  selectChat(id: string): void;
  renameChat(id: string, title: string): void;
  deleteChat(id: string): void;
  selectModel(id: string): void;
  downloadModel(id: string, accepted: boolean): Promise<void>;
  importModel(id: string, files: File[], accepted: boolean): Promise<void>;
  pauseDownload(): void;
  deleteModel(id: string): Promise<void>;
  loadModel(id: string): Promise<void>;
  unloadModel(): void;
  send(text: string): Promise<void>;
  stop(): void;
  refresh(): Promise<void>;
  requestPersistence(): Promise<void>;
  setOptions(value: Partial<StudioState['options']>): void;
  setTheme(theme: StudioState['theme']): void;
  clearError(): void;
}
